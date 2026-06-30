import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { db, opfsHelper, type EncryptedFile, type EncryptedCategory } from '../../lib/db';
import { generateAES256Key, wrapKey, unwrapKey, encryptChunk, decryptChunk, getChunkIV, CHUNK_SIZE, arrayBufferToBase64, base64ToArrayBuffer } from '../../lib/crypto';
import { Upload, File as FileIcon, Download, Eye, Lock, LogOut, Loader2, Trash2, X, Settings as SettingsIcon, ChevronDown, FileUp, Search, Menu, Edit3 } from 'lucide-react';
import { Settings } from './Settings';
import { Sidebar } from './Sidebar';
import { NoteEditor } from './NoteEditor';
import { ConfirmModal } from './ConfirmModal';

export function VaultDashboard() {
  const { t, i18n } = useTranslation();
  const { masterDataKey, logout, isDecoy } = useAuth();
  
  const [files, setFiles] = useState<{ meta: EncryptedFile; name: string }[]>([]);
  const [categories, setCategories] = useState<{ meta: EncryptedCategory; name: string }[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<{ url: string; type: string; name: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [isEditingNote, setIsEditingNote] = useState(false);

  useEffect(() => {
    if (masterDataKey) {
      loadCategories();
      loadFiles();
    }
  }, [masterDataKey]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl.url);
    };
  }, [previewUrl]);

  const loadCategories = async () => {
    if (!masterDataKey) return;
    const allCats = await db.categories.toArray();
    const filteredCats = allCats.filter(c => !!c.isDecoy === isDecoy);
    const decryptedCats = await Promise.all(
      filteredCats.map(async (cat) => {
        const dek = await unwrapKey(cat.wrappedDEK, masterDataKey, cat.dekIV, ['encrypt', 'decrypt']);
        const nameBuffer = await decryptChunk(cat.encryptedName, dek, getChunkIV(cat.dekIV, 111111));
        const name = new TextDecoder().decode(nameBuffer);
        return { meta: cat, name };
      })
    );
    setCategories(decryptedCats.sort((a, b) => b.meta.createdAt - a.meta.createdAt));
  };

  const loadFiles = async () => {
    if (!masterDataKey) return;
    const allFiles = await db.files.toArray();
    const filteredFiles = allFiles.filter(f => !!f.isDecoy === isDecoy);
    const decryptedFiles = await Promise.all(
      filteredFiles.map(async (file) => {
        const dek = await unwrapKey(file.wrappedDEK, masterDataKey, file.dekIV, ['encrypt', 'decrypt']);
        const nameBuffer = await decryptChunk(file.encryptedName, dek, getChunkIV(file.dekIV, 999999));
        const name = new TextDecoder().decode(nameBuffer);
        return { meta: file, name };
      })
    );
    setFiles(decryptedFiles.sort((a, b) => b.meta.createdAt - a.meta.createdAt));
  };

  const handleCreateCategory = async (name: string) => {
    if (!masterDataKey) return;
    try {
      const dek = await generateAES256Key();
      const { wrappedKey: wrappedDEK, iv: dekIV } = await wrapKey(dek, masterDataKey);
      const nameBuffer = new TextEncoder().encode(name);
      const encryptedName = await encryptChunk(nameBuffer as any, dek, getChunkIV(dekIV, 111111) as any);

      await db.categories.add({
        id: crypto.randomUUID(),
        encryptedName,
        createdAt: Date.now(),
        wrappedDEK,
        dekIV,
        isDecoy: isDecoy || undefined
      });
      await loadCategories();
    } catch (err) {
      console.error(err);
      alert("Failed to create folder.");
    }
  };

  const handleDeleteCategory = async (id: string) => {
    setConfirmDialog({
      title: t('dashboard.deleteFolderTitle'),
      message: t('dashboard.deleteFolderConfirm'),
      onConfirm: async () => {
        const filesInCat = await db.files.where('categoryId').equals(id).count();
        if (filesInCat > 0) {
          alert(t('dashboard.folderNotEmpty'));
          return;
        }
        await db.categories.delete(id);
        if (activeCategoryId === id) setActiveCategoryId('all');
        await loadCategories();
      }
    });
  };

  const handleFileUpload = async (input: React.ChangeEvent<HTMLInputElement> | File) => {
    if (!masterDataKey) return;
    let file: File;
    if (input instanceof File) {
      file = input;
    } else {
      if (!input.target.files || input.target.files.length === 0) return;
      file = input.target.files[0];
    }
    
    setIsUploading(true);
    setUploadProgress(0);

    try {
      if (file.name.endsWith('.svault')) {
        const arrayBuffer = await file.arrayBuffer();
        const view = new DataView(arrayBuffer);
        const metaLength = view.getUint32(0, false);
        
        const metaBuffer = arrayBuffer.slice(4, 4 + metaLength);
        const metaString = new TextDecoder().decode(metaBuffer);
        const metadata = JSON.parse(metaString);

        const chunksBuffer = arrayBuffer.slice(4 + metaLength);
        const fileId = crypto.randomUUID();
        const opfsPath = `vault_${fileId}.enc`;
        await opfsHelper.writeFileChunks(opfsPath, [chunksBuffer]);

        await db.files.add({
          id: fileId,
          encryptedName: base64ToArrayBuffer(metadata.encryptedName),
          encryptedMimeType: base64ToArrayBuffer(metadata.encryptedMimeType),
          size: metadata.size,
          createdAt: Date.now(),
          wrappedDEK: base64ToArrayBuffer(metadata.wrappedDEK),
          dekIV: new Uint8Array(base64ToArrayBuffer(metadata.dekIV)),
          chunksOpfsPath: opfsPath,
          categoryId: activeCategoryId === 'all' ? undefined : activeCategoryId,
          isDecoy: isDecoy || undefined
        });
        
        await loadFiles();
        return;
      }

      const dek = await generateAES256Key();
      const { wrappedKey: wrappedDEK, iv: dekIV } = await wrapKey(dek, masterDataKey);
      const nameBuffer = new TextEncoder().encode(file.name);
      const mimeBuffer = new TextEncoder().encode(file.type || 'application/octet-stream');
      
      const encryptedName = await encryptChunk(nameBuffer as any, dek, getChunkIV(dekIV, 999999) as any);
      const encryptedMimeType = await encryptChunk(mimeBuffer as any, dek, getChunkIV(dekIV, 999998) as any);

      const fileId = crypto.randomUUID();
      const opfsPath = `vault_${fileId}.enc`;

      const arrayBuffer = await file.arrayBuffer();
      const chunks = [];
      let offset = 0;
      let chunkIndex = 0;

      while (offset < arrayBuffer.byteLength) {
        const end = Math.min(offset + CHUNK_SIZE, arrayBuffer.byteLength);
        const chunk = arrayBuffer.slice(offset, end);
        const encryptedChunk = await encryptChunk(chunk, dek, getChunkIV(dekIV, chunkIndex));
        chunks.push(encryptedChunk);
        offset += CHUNK_SIZE;
        chunkIndex++;
        setUploadProgress(Math.floor((offset / arrayBuffer.byteLength) * 100));
      }

      await opfsHelper.writeFileChunks(opfsPath, chunks);

      await db.files.add({
        id: fileId,
        encryptedName,
        encryptedMimeType,
        size: file.size,
        createdAt: Date.now(),
        wrappedDEK,
        dekIV,
        chunksOpfsPath: opfsPath,
        categoryId: activeCategoryId === 'all' ? undefined : activeCategoryId,
        isDecoy: isDecoy || undefined
      });

      await loadFiles();
    } catch (err) {
      console.error("Upload failed:", err);
      alert("Encryption failed.");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (!(input instanceof File)) {
        input.target.value = '';
      }
    }
  };

  const handleSaveNote = async (title: string, content: string) => {
    if (!masterDataKey) return;
    setIsUploading(true);
    try {
      const dek = await generateAES256Key();
      const { wrappedKey: wrappedDEK, iv: dekIV } = await wrapKey(dek, masterDataKey);
      
      const ext = title.includes('.') ? '' : '.txt';
      const nameBuffer = new TextEncoder().encode(title + ext);
      const mimeBuffer = new TextEncoder().encode('text/plain');
      const contentBuffer = new TextEncoder().encode(content);
      
      const encryptedName = await encryptChunk(nameBuffer as any, dek, getChunkIV(dekIV, 999999) as any);
      const encryptedMimeType = await encryptChunk(mimeBuffer as any, dek, getChunkIV(dekIV, 999998) as any);

      const fileId = crypto.randomUUID();
      const opfsPath = `vault_${fileId}.enc`;

      // Encrypt the note content as a single chunk since it's typically small
      const encryptedContent = await encryptChunk(contentBuffer as any, dek, getChunkIV(dekIV, 0));
      await opfsHelper.writeFileChunks(opfsPath, [encryptedContent]);

      // Secure wipe the plain text buffer in memory
      contentBuffer.fill(0);

      await db.files.add({
        id: fileId,
        encryptedName,
        encryptedMimeType,
        size: contentBuffer.byteLength,
        createdAt: Date.now(),
        wrappedDEK,
        dekIV,
        chunksOpfsPath: opfsPath,
        categoryId: activeCategoryId === 'all' ? undefined : activeCategoryId,
        isDecoy: isDecoy || undefined
      });

      await loadFiles();
      setIsEditingNote(false);
    } catch (err) {
      console.error("Save note failed:", err);
      alert("Failed to save note.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = async (fileInfo: { meta: EncryptedFile; name: string }, action: 'preview' | 'download' | 'export-encrypted') => {
    if (!masterDataKey) return;
    setIsProcessing(true);

    try {
      const { meta, name } = fileInfo;

      if (action === 'export-encrypted') {
        const opfsFile = await opfsHelper.readFile(meta.chunksOpfsPath);
        const chunkBuffer = await opfsFile.arrayBuffer();

        const metadata = {
          id: meta.id,
          size: meta.size,
          encryptedName: arrayBufferToBase64(meta.encryptedName),
          encryptedMimeType: arrayBufferToBase64(meta.encryptedMimeType),
          wrappedDEK: arrayBufferToBase64(meta.wrappedDEK),
          dekIV: arrayBufferToBase64(meta.dekIV.buffer as any)
        };
        const metaString = JSON.stringify(metadata);
        const metaBuffer = new TextEncoder().encode(metaString);

        const lengthBuffer = new ArrayBuffer(4);
        new DataView(lengthBuffer).setUint32(0, metaBuffer.byteLength, false);

        const blob = new Blob([lengthBuffer, metaBuffer, chunkBuffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name + '.svault';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        
        setIsProcessing(false);
        return;
      }

      const dek = await unwrapKey(meta.wrappedDEK, masterDataKey, meta.dekIV, ['encrypt', 'decrypt']);
      const mimeBuffer = await decryptChunk(meta.encryptedMimeType, dek, getChunkIV(meta.dekIV, 999998));
      const mimeType = new TextDecoder().decode(mimeBuffer);

      const opfsFile = await opfsHelper.readFile(meta.chunksOpfsPath);
      const arrayBuffer = await opfsFile.arrayBuffer();

      const decryptedChunks: ArrayBuffer[] = [];
      let offset = 0;
      let chunkIndex = 0;
      const ENCRYPTED_CHUNK_SIZE = CHUNK_SIZE + 16;

      while (offset < arrayBuffer.byteLength) {
        let currentChunkSize = ENCRYPTED_CHUNK_SIZE;
        if (offset + ENCRYPTED_CHUNK_SIZE > arrayBuffer.byteLength) {
           currentChunkSize = arrayBuffer.byteLength - offset;
        }
        const chunk = arrayBuffer.slice(offset, offset + currentChunkSize);
        const decryptedChunk = await decryptChunk(chunk, dek, getChunkIV(meta.dekIV, chunkIndex));
        decryptedChunks.push(decryptedChunk);
        offset += currentChunkSize;
        chunkIndex++;
      }

      const blob = new Blob(decryptedChunks, { type: mimeType });

      if (action === 'download') {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else if (action === 'preview') {
        if (previewUrl) URL.revokeObjectURL(previewUrl.url);
        
        // If it's a text note, we should render text directly
        if (mimeType.startsWith('text/')) {
          const textDecoded = new TextDecoder().decode(blob.arrayBuffer ? await blob.arrayBuffer() : await new Response(blob).arrayBuffer());
          const url = 'data:text/plain;charset=utf-8,' + encodeURIComponent(textDecoded);
          setPreviewUrl({ url, type: mimeType, name });
        } else {
          const url = URL.createObjectURL(blob);
          setPreviewUrl({ url, type: mimeType, name });
        }
      }
    } catch (err) {
      console.error("Decryption failed:", err);
      alert("Failed to decrypt file. It may be corrupted.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteFile = async (fileId: string, opfsPath: string) => {
    setConfirmDialog({
      title: t('dashboard.deleteFileTitle'),
      message: t('dashboard.deleteFileConfirm'),
      onConfirm: async () => {
        try {
          await db.files.delete(fileId);
          await opfsHelper.deleteFile(opfsPath);
          await loadFiles();
        } catch (err) {
          console.error("Delete failed:", err);
          alert(t('dashboard.deleteFailed'));
        }
      }
    });
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isUploading) setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isUploading || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
    handleFileUpload(e.dataTransfer.files[0]);
  };

  const displayedFiles = files.filter(f => {
    const matchesCategory = activeCategoryId === 'all' ? true : f.meta.categoryId === activeCategoryId;
    const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-200">
      <header className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-white/5 bg-slate-900/50 backdrop-blur-md z-30">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 -ml-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-violet-600 to-fuchsia-600 shadow-lg">
            <Lock className="h-4 w-4 text-white" />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-white hidden sm:block">{t('common.secureVault')}</h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <SettingsIcon className="h-5 w-5" />
          </button>
          <button
            onClick={logout}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">{t('dashboard.lockVault')}</span>
          </button>
        </div>
      </header>

      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      {isEditingNote && (
        <NoteEditor
          onSave={handleSaveNote}
          onClose={() => setIsEditingNote(false)}
        />
      )}

      {confirmDialog && (
        <ConfirmModal
          title={confirmDialog.title}
          message={confirmDialog.message}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
          confirmText={t('common.delete')}
        />
      )}

      <div className="flex flex-1 overflow-hidden relative">
        <Sidebar 
          categories={categories}
          activeCategoryId={activeCategoryId}
          onSelectCategory={setActiveCategoryId}
          onCreateCategory={handleCreateCategory}
          onDeleteCategory={handleDeleteCategory}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />

        <main 
          className="flex-1 overflow-y-auto relative p-6 lg:p-8"
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {isDragging && (
            <div className="absolute inset-0 z-40 bg-violet-600/10 backdrop-blur-sm border-2 border-dashed border-violet-500 m-6 rounded-3xl flex flex-col items-center justify-center text-violet-400 pointer-events-none">
              <FileUp className="h-16 w-16 mb-4 animate-bounce" />
              <h2 className="text-2xl font-bold">{t('dashboard.dropToEncrypt')}</h2>
              <p className="mt-2 text-violet-300/70">{t('dashboard.dropToEncryptDesc')}</p>
            </div>
          )}

          <div className="max-w-6xl mx-auto space-y-8">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <h2 className="text-2xl font-bold text-white whitespace-nowrap">
                {activeCategoryId === 'all' ? t('sidebar.allFiles') : categories.find(c => c.meta.id === activeCategoryId)?.name || t('sidebar.folders')}
              </h2>
              
              <div className="flex-1 max-w-md relative">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input 
                  type="text" 
                  placeholder={t('dashboard.searchPlaceholder')} 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-900/50 border border-white/10 rounded-xl py-3 ps-10 pe-4 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500 transition-colors shadow-inner"
                />
              </div>

              <div className="relative z-10 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => setIsEditingNote(true)}
                  disabled={isUploading}
                  className={`flex items-center gap-2 rounded-xl bg-slate-800 px-5 py-3 text-sm font-semibold text-slate-300 transition-all shadow-lg hover:bg-slate-700 hover:text-white ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Edit3 className="h-4 w-4" />
                  {t('dashboard.createNote')}
                </button>

                <input
                  type="file"
                  id="importVaultUpload"
                  className="hidden"
                  accept=".svault"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                />
                <label
                  htmlFor="importVaultUpload"
                  className={`flex items-center gap-2 rounded-xl bg-slate-800 px-5 py-3 text-sm font-semibold text-slate-300 transition-all shadow-lg hover:bg-slate-700 hover:text-white cursor-pointer ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
                >
                  <Download className="h-4 w-4" />
                  {t('dashboard.importVault')}
                </label>

                <input
                  type="file"
                  id="fileUpload"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                />
                <label
                  htmlFor="fileUpload"
                  className={`flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition-all shadow-lg shadow-violet-900/20 ${isUploading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-violet-500 cursor-pointer'}`}
                >
                  {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {isUploading ? t('dashboard.encrypting', { progress: uploadProgress }) : t('dashboard.uploadFile')}
                </label>
              </div>
            </div>

            {/* List View */}
            {viewMode === 'list' && displayedFiles.length > 0 && (
              <div className="bg-slate-900/40 border border-white/10 rounded-2xl backdrop-blur-xl">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-950/50 text-slate-400 border-b border-white/5">
                    <tr>
                      <th className="px-4 sm:px-6 py-4 font-medium rounded-tl-2xl whitespace-nowrap">{t('common.name')}</th>
                      <th className="px-4 sm:px-6 py-4 font-medium hidden lg:table-cell whitespace-nowrap">{t('common.dateAdded')}</th>
                      <th className="px-4 sm:px-6 py-4 font-medium hidden md:table-cell whitespace-nowrap">{t('common.size')}</th>
                      <th className="px-4 sm:px-6 py-4 font-medium text-end rounded-tr-2xl whitespace-nowrap">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {displayedFiles.map(file => (
                      <tr key={file.meta.id} className="hover:bg-slate-800/50 transition-colors group [&:last-child>td:first-child]:rounded-bl-2xl [&:last-child>td:last-child]:rounded-br-2xl">
                        <td className="px-4 sm:px-6 py-4 flex items-center gap-2 sm:gap-3">
                          <div className="h-10 w-10 rounded-lg bg-violet-500/10 text-violet-400 flex items-center justify-center shrink-0">
                            <FileIcon className="h-5 w-5" />
                          </div>
                          <span className="font-medium text-white truncate max-w-[120px] sm:max-w-[200px] lg:max-w-xs" title={file.name}>{file.name}</span>
                        </td>
                        <td className="px-4 sm:px-6 py-4 hidden lg:table-cell text-slate-400 whitespace-nowrap">
                          {new Date(file.meta.createdAt).toLocaleDateString(i18n.language)}
                        </td>
                        <td className="px-4 sm:px-6 py-4 hidden md:table-cell text-slate-400 whitespace-nowrap">
                          {(file.meta.size / 1024 / 1024).toFixed(2)} MB
                        </td>
                        <td className="px-4 sm:px-6 py-4 text-end whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => handleDownload(file, 'preview')} disabled={isProcessing} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white transition-colors" title={t('dashboard.preview')}>
                              <Eye className="h-4 w-4" />
                            </button>
                            <div className="relative group/dropdown">
                              <button disabled={isProcessing} className="flex items-center gap-1 p-2 rounded-lg bg-violet-600/10 text-violet-400 hover:bg-violet-600/20 transition-colors">
                                <Download className="h-4 w-4" />
                                <ChevronDown className="h-3 w-3 opacity-50" />
                              </button>
                              <div className="absolute end-0 bottom-full pb-2 hidden w-48 group-hover/dropdown:block z-20">
                                <div className="flex flex-col rounded-xl border border-white/10 bg-slate-900 shadow-2xl overflow-hidden">
                                  <button onClick={() => handleDownload(file, 'download')} className="px-4 py-3 text-start text-sm text-slate-300 hover:bg-slate-800 border-b border-white/5">{t('dashboard.exportDecrypted')}</button>
                                  <button onClick={() => handleDownload(file, 'export-encrypted')} className="px-4 py-3 text-start text-sm text-violet-300 hover:bg-violet-900/40">{t('dashboard.exportEncrypted')}</button>
                                </div>
                              </div>
                            </div>
                            <button onClick={() => handleDeleteFile(file.meta.id, file.meta.chunksOpfsPath)} className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-colors opacity-0 group-hover:opacity-100">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Grid View */}
            {viewMode === 'grid' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                {displayedFiles.map((file) => (
                  <div key={file.meta.id} className="group relative flex flex-col justify-between rounded-2xl border border-white/10 bg-slate-900/40 p-4 sm:p-6 backdrop-blur-xl transition-all hover:bg-slate-800/60 hover:shadow-xl hover:shadow-violet-900/10">
                    <div className="flex items-start justify-between">
                      <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400 shrink-0">
                        <FileIcon className="h-5 w-5 sm:h-6 sm:w-6" />
                      </div>
                      <button 
                        onClick={() => handleDeleteFile(file.meta.id, file.meta.chunksOpfsPath)}
                        className="opacity-0 group-hover:opacity-100 p-2 text-slate-500 hover:text-red-400 transition-all rounded-lg hover:bg-red-400/10 shrink-0 ml-2"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    
                    <div className="mt-4">
                      <h3 className="text-base sm:text-lg font-medium text-white truncate" title={file.name}>
                        {file.name}
                      </h3>
                      <p className="text-xs sm:text-sm text-slate-400 mt-1 flex items-center justify-start rtl:justify-end gap-1.5 flex-wrap" dir="ltr">
                        <span>{(file.meta.size / 1024 / 1024).toFixed(2)} MB</span>
                        <span className="opacity-50">•</span>
                        <span>{new Date(file.meta.createdAt).toLocaleDateString(i18n.language)}</span>
                      </p>
                    </div>

                    <div className="mt-5 sm:mt-6 flex flex-col 2xl:flex-row gap-2 sm:gap-3">
                      <button
                        onClick={() => handleDownload(file, 'preview')}
                        disabled={isProcessing}
                        className="flex-1 flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg bg-slate-800 py-2 sm:py-2.5 text-xs sm:text-sm font-medium text-white hover:bg-slate-700 transition-colors disabled:opacity-50"
                      >
                        <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> {t('dashboard.preview')}
                      </button>
                      <div className="relative flex-1 group/dropdown">
                        <button
                          disabled={isProcessing}
                          className="w-full flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg bg-violet-600/10 py-2 sm:py-2.5 text-xs sm:text-sm font-medium text-violet-400 hover:bg-violet-600/20 hover:text-violet-300 transition-colors disabled:opacity-50 border border-violet-500/20"
                        >
                          <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> {t('dashboard.export')}
                          <ChevronDown className="h-3.5 w-3.5 sm:h-4 sm:w-4 opacity-50" />
                        </button>
                        <div className="absolute end-0 bottom-full pb-2 hidden w-48 group-hover/dropdown:block z-20">
                          <div className="flex flex-col rounded-xl border border-white/10 bg-slate-900 shadow-2xl overflow-hidden">
                            <button
                              onClick={() => handleDownload(file, 'download')}
                              className="px-4 py-3 text-start text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors border-b border-white/5"
                            >
                              <span className="block font-medium">{t('dashboard.exportDecrypted')}</span>
                              <span className="block text-xs text-slate-500 mt-0.5">{t('dashboard.originalFile')}</span>
                            </button>
                            <button
                              onClick={() => handleDownload(file, 'export-encrypted')}
                              className="px-4 py-3 text-start text-sm text-violet-300 hover:bg-violet-900/40 hover:text-violet-200 transition-colors"
                            >
                              <span className="block font-medium">{t('dashboard.exportEncrypted')}</span>
                              <span className="block text-xs text-violet-500/70 mt-0.5">{t('dashboard.svaultFormat')}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {displayedFiles.length === 0 && !isUploading && (
              <div className="col-span-full py-20 flex flex-col items-center justify-center text-center border-2 border-dashed border-white/5 rounded-3xl">
                <div className="h-16 w-16 rounded-full bg-slate-900/50 flex items-center justify-center mb-4">
                  <FileUp className="h-8 w-8 text-slate-500" />
                </div>
                <h3 className="text-lg font-medium text-white">{t('dashboard.emptyVault')}</h3>
                <p className="text-sm text-slate-400 mt-1 max-w-sm">
                  {t('dashboard.emptyVaultDesc')}
                </p>
              </div>
            )}
          </div>
        </main>
      </div>

      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="relative flex flex-col w-full max-w-5xl max-h-[90vh] bg-slate-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-slate-900/80">
              <h3 className="text-lg font-medium text-white truncate pr-4">{previewUrl.name}</h3>
              <button
                onClick={() => setPreviewUrl(null)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-slate-950 flex items-center justify-center min-h-[300px]">
              {previewUrl.type.startsWith('image/') ? (
                <img src={previewUrl.url} alt={previewUrl.name} className="max-w-full max-h-[75vh] object-contain rounded-lg" />
              ) : previewUrl.type.startsWith('video/') ? (
                <video src={previewUrl.url} controls className="max-w-full max-h-[75vh] rounded-lg" />
              ) : previewUrl.type === 'application/pdf' ? (
                <iframe src={previewUrl.url} className="w-full h-[75vh] rounded-lg bg-white" title={previewUrl.name} />
              ) : previewUrl.type.startsWith('text/') || previewUrl.url.startsWith('data:text') ? (
                <div className="w-full h-[75vh] bg-slate-950 p-6 overflow-auto rounded-lg text-slate-200 font-mono text-sm whitespace-pre-wrap">
                  {decodeURIComponent(previewUrl.url.replace('data:text/plain;charset=utf-8,', ''))}
                </div>
              ) : (
                <div className="text-center text-slate-400">
                  <FileIcon className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p>{t('dashboard.noPreviewAvailable')}</p>
                  <p className="text-sm mt-2 opacity-70">{previewUrl.type}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
