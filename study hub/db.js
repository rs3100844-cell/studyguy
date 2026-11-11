/**
 * Study hub — IndexedDB Data Layer
 * Handles local persistence of classes, subjects, chapters, study materials (PDFs, Images),
 * recent files tracking, and backup export/restore.
 */

const StudyHubDB = (function() {
  const DB_NAME = 'StudyHub_Database_v1';
  const DB_VERSION = 1;
  let dbInstance = null;

  // Open & initialize IndexedDB
  function openDB() {
    if (dbInstance) {
      return Promise.resolve(dbInstance);
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 1. Classes Store
        if (!db.objectStoreNames.contains('classes')) {
          db.createObjectStore('classes', { keyPath: 'id' });
        }

        // 2. Subjects Store
        if (!db.objectStoreNames.contains('subjects')) {
          const subjectsStore = db.createObjectStore('subjects', { keyPath: 'id' });
          subjectsStore.createIndex('classId', 'classId', { unique: false });
        }

        // 3. Chapters Store
        if (!db.objectStoreNames.contains('chapters')) {
          const chaptersStore = db.createObjectStore('chapters', { keyPath: 'id' });
          chaptersStore.createIndex('subjectId', 'subjectId', { unique: false });
          chaptersStore.createIndex('classId', 'classId', { unique: false });
        }

        // 4. Study Materials Files Store
        if (!db.objectStoreNames.contains('files')) {
          const filesStore = db.createObjectStore('files', { keyPath: 'id' });
          filesStore.createIndex('chapterId', 'chapterId', { unique: false });
          filesStore.createIndex('subjectId', 'subjectId', { unique: false });
          filesStore.createIndex('classId', 'classId', { unique: false });
          filesStore.createIndex('category', 'category', { unique: false });
          filesStore.createIndex('chapter_category', ['chapterId', 'category'], { unique: false });
        }

        // 5. Recent Files Store
        if (!db.objectStoreNames.contains('recent')) {
          const recentStore = db.createObjectStore('recent', { keyPath: 'id' });
          recentStore.createIndex('openedAt', 'openedAt', { unique: false });
        }
      };

      request.onsuccess = async (event) => {
        dbInstance = event.target.result;
        resolve(dbInstance);
      };

      request.onerror = (event) => {
        console.error('IndexedDB open error:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  // Initialize Class 1 to 12
  async function initClasses() {
    const db = dbInstance;
    const count = await new Promise((res) => {
      const tx = db.transaction('classes', 'readonly');
      const req = tx.objectStore('classes').count();
      req.onsuccess = () => res(req.result);
      req.onerror = () => res(0);
    });

    if (count < 12) {
      const tx = db.transaction('classes', 'readwrite');
      const store = tx.objectStore('classes');

      const classStages = {
        1: 'Primary', 2: 'Primary', 3: 'Primary', 4: 'Primary', 5: 'Primary',
        6: 'Middle School', 7: 'Middle School', 8: 'Middle School',
        9: 'Secondary', 10: 'Secondary (Board)',
        11: 'Senior Secondary', 12: 'Senior Secondary (Board)'
      };

      for (let i = 1; i <= 12; i++) {
        store.put({
          id: i,
          name: `Class ${i}`,
          stage: classStages[i] || 'School',
          description: `Study materials and subjects for Class ${i}`
        });
      }

      await new Promise((res) => {
        tx.oncomplete = () => res();
      });
    }
  }

  // Helper for generic transaction
  function txOp(storeName, mode, callback) {
    return openDB().then((db) => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);

        tx.onerror = (e) => reject(e.target.error);
        tx.onabort = (e) => reject(e.target.error);

        callback(store, resolve, reject, tx);
      });
    });
  }

  // ==================== SUBJECTS ====================
  function getAllSubjects() {
    return txOp('subjects', 'readonly', (store, resolve) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const list = req.result || [];
        list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        resolve(list);
      };
    });
  }

  function getSubjectsByClass(classId) {
    if (!classId) return getAllSubjects();
    const cId = parseInt(classId, 10);
    return txOp('subjects', 'readonly', (store, resolve) => {
      if (store.indexNames.contains('classId')) {
        const index = store.index('classId');
        const req = index.getAll(cId);
        req.onsuccess = () => {
          const list = req.result || [];
          list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          resolve(list);
        };
      } else {
        getAllSubjects().then(list => resolve(list));
      }
    });
  }

  function getSubject(id) {
    return txOp('subjects', 'readonly', (store, resolve) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
    });
  }

  function addSubject(subject) {
    const id = subject.id || 'sub_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const data = {
      ...subject,
      id,
      name: (subject.name || '').trim(),
      color: subject.color || '#FFD000',
      description: (subject.description || '').trim(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    if (subject.classId) {
      data.classId = parseInt(subject.classId, 10);
    }

    return txOp('subjects', 'readwrite', (store, resolve) => {
      const req = store.add(data);
      req.onsuccess = () => resolve(data);
    });
  }

  function updateSubject(subject) {
    return txOp('subjects', 'readwrite', (store, resolve) => {
      const getReq = store.get(subject.id);
      getReq.onsuccess = () => {
        if (!getReq.result) {
          resolve(null);
          return;
        }
        const updated = {
          ...getReq.result,
          ...subject,
          name: (subject.name || getReq.result.name || '').trim(),
          color: subject.color || getReq.result.color || '#FFD000',
          description: subject.description !== undefined ? subject.description.trim() : (getReq.result.description || ''),
          updatedAt: Date.now()
        };
        const putReq = store.put(updated);
        putReq.onsuccess = () => resolve(updated);
      };
    });
  }

  async function deleteSubject(subjectId) {
    // Delete all chapters under this subject
    const chapters = await getChaptersBySubject(subjectId);
    for (const chap of chapters) {
      await deleteChapter(chap.id);
    }

    return txOp('subjects', 'readwrite', (store, resolve) => {
      const req = store.delete(subjectId);
      req.onsuccess = () => resolve(true);
    });
  }

  // ==================== CHAPTERS ====================
  function getChaptersBySubject(subjectId) {
    return txOp('chapters', 'readonly', (store, resolve) => {
      const index = store.index('subjectId');
      const req = index.getAll(subjectId);
      req.onsuccess = () => {
        const list = req.result || [];
        // Sort numerically by chapterNumber, then by title
        list.sort((a, b) => {
          const numA = parseInt(a.chapterNumber, 10) || 0;
          const numB = parseInt(b.chapterNumber, 10) || 0;
          if (numA !== numB) return numA - numB;
          return (a.title || '').localeCompare(b.title || '');
        });
        resolve(list);
      };
    });
  }

  function getChapter(id) {
    return txOp('chapters', 'readonly', (store, resolve) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
    });
  }

  function addChapter(chapter) {
    const id = chapter.id || 'chap_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const data = {
      ...chapter,
      id,
      subjectId: chapter.subjectId,
      chapterNumber: parseInt(chapter.chapterNumber, 10) || 1,
      title: (chapter.title || '').trim(),
      description: (chapter.description || '').trim(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    if (chapter.classId) {
      data.classId = parseInt(chapter.classId, 10);
    }

    return txOp('chapters', 'readwrite', (store, resolve) => {
      const req = store.add(data);
      req.onsuccess = () => resolve(data);
    });
  }

  function updateChapter(chapter) {
    return txOp('chapters', 'readwrite', (store, resolve) => {
      const getReq = store.get(chapter.id);
      getReq.onsuccess = () => {
        if (!getReq.result) {
          resolve(null);
          return;
        }
        const updated = {
          ...getReq.result,
          ...chapter,
          chapterNumber: parseInt(chapter.chapterNumber || getReq.result.chapterNumber, 10) || 1,
          title: (chapter.title || getReq.result.title || '').trim(),
          description: chapter.description !== undefined ? chapter.description.trim() : (getReq.result.description || ''),
          updatedAt: Date.now()
        };
        const putReq = store.put(updated);
        putReq.onsuccess = () => resolve(updated);
      };
    });
  }

  async function deleteChapter(chapterId) {
    // Delete all files under this chapter
    const files = await getAllFilesByChapter(chapterId);
    for (const f of files) {
      await deleteFile(f.id);
    }

    return txOp('chapters', 'readwrite', (store, resolve) => {
      const req = store.delete(chapterId);
      req.onsuccess = () => resolve(true);
    });
  }

  // ==================== STUDY MATERIALS / FILES ====================
  function getFilesByChapterAndCategory(chapterId, category) {
    return txOp('files', 'readonly', (store, resolve) => {
      const index = store.index('chapter_category');
      const req = index.getAll([chapterId, category]);
      req.onsuccess = () => {
        const list = req.result || [];
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        resolve(list);
      };
    });
  }

  function getAllFilesByChapter(chapterId) {
    return txOp('files', 'readonly', (store, resolve) => {
      const index = store.index('chapterId');
      const req = index.getAll(chapterId);
      req.onsuccess = () => resolve(req.result || []);
    });
  }

  function getFile(id) {
    return txOp('files', 'readonly', (store, resolve) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
    });
  }

  function addFile(fileData) {
    const id = fileData.id || 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 7);
    const data = {
      ...fileData,
      id,
      createdAt: fileData.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    if (fileData.classId) {
      data.classId = parseInt(fileData.classId, 10);
    }

    return txOp('files', 'readwrite', (store, resolve) => {
      const req = store.add(data);
      req.onsuccess = () => resolve(data);
    });
  }

  function updateFileName(fileId, newName) {
    return txOp('files', 'readwrite', (store, resolve) => {
      const req = store.get(fileId);
      req.onsuccess = () => {
        const file = req.result;
        if (!file) return resolve(null);
        file.name = newName.trim();
        file.updatedAt = Date.now();
        store.put(file).onsuccess = () => {
          // Also update name in recent store if present
          updateRecentFileName(fileId, file.name);
          resolve(file);
        };
      };
    });
  }

  async function deleteFile(fileId) {
    // Also remove from recent files
    await removeRecentFile(fileId);

    return txOp('files', 'readwrite', (store, resolve) => {
      const req = store.delete(fileId);
      req.onsuccess = () => resolve(true);
    });
  }

  // ==================== RECENT FILES ====================
  function addRecentFile(file) {
    const recentItem = {
      id: file.id,
      name: file.name,
      category: file.category,
      type: file.type,
      size: file.size,
      subjectId: file.subjectId,
      chapterId: file.chapterId,
      openedAt: Date.now()
    };
    if (file.classId) {
      recentItem.classId = file.classId;
    }

    return txOp('recent', 'readwrite', (store, resolve) => {
      store.put(recentItem).onsuccess = () => resolve(recentItem);
    });
  }

  function getRecentFiles(limit = 10) {
    return txOp('recent', 'readonly', (store, resolve) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const list = req.result || [];
        list.sort((a, b) => b.openedAt - a.openedAt);
        resolve(list.slice(0, limit));
      };
    });
  }

  function removeRecentFile(fileId) {
    return txOp('recent', 'readwrite', (store, resolve) => {
      store.delete(fileId).onsuccess = () => resolve(true);
    });
  }

  function updateRecentFileName(fileId, newName) {
    return txOp('recent', 'readwrite', (store, resolve) => {
      const req = store.get(fileId);
      req.onsuccess = () => {
        if (req.result) {
          req.result.name = newName;
          store.put(req.result);
        }
        resolve(true);
      };
    });
  }

  // ==================== STATS & COUNTS ====================
  async function getAppStats() {
    await openDB();
    const subjects = await txOp('subjects', 'readonly', (s, res) => {
      s.getAll().onsuccess = (e) => res(e.target.result || []);
    });
    const chapters = await txOp('chapters', 'readonly', (s, res) => {
      s.getAll().onsuccess = (e) => res(e.target.result || []);
    });
    const files = await txOp('files', 'readonly', (s, res) => {
      s.getAll().onsuccess = (e) => res(e.target.result || []);
    });

    let totalBytes = 0;
    for (const f of files) {
      totalBytes += (f.size || 0);
    }

    // Per-class metrics
    const classMetrics = {};
    for (let c = 1; c <= 12; c++) {
      classMetrics[c] = { subjectsCount: 0, chaptersCount: 0, filesCount: 0 };
    }

    subjects.forEach((sub) => {
      if (classMetrics[sub.classId]) {
        classMetrics[sub.classId].subjectsCount++;
      }
    });

    chapters.forEach((chap) => {
      if (classMetrics[chap.classId]) {
        classMetrics[chap.classId].chaptersCount++;
      }
    });

    files.forEach((file) => {
      if (classMetrics[file.classId]) {
        classMetrics[file.classId].filesCount++;
      }
    });

    return {
      totalSubjects: subjects.length,
      totalChapters: chapters.length,
      totalFiles: files.length,
      totalBytes,
      classMetrics
    };
  }

  // ==================== GLOBAL SEARCH ====================
  async function searchMaterials(query, filterSubject = null, filterCategory = null) {
    await openDB();
    const q = (query || '').toLowerCase().trim();

    const [files, subjects, chapters] = await Promise.all([
      txOp('files', 'readonly', (s, res) => s.getAll().onsuccess = (e) => res(e.target.result || [])),
      txOp('subjects', 'readonly', (s, res) => s.getAll().onsuccess = (e) => res(e.target.result || [])),
      txOp('chapters', 'readonly', (s, res) => s.getAll().onsuccess = (e) => res(e.target.result || []))
    ]);

    const subjectMap = new Map();
    subjects.forEach(s => subjectMap.set(s.id, s));

    const chapterMap = new Map();
    chapters.forEach(c => chapterMap.set(c.id, c));

    const results = [];

    for (const f of files) {
      if (filterSubject && filterSubject !== 'all' && f.subjectId !== filterSubject) {
        continue;
      }
      if (filterCategory && filterCategory !== 'all' && f.category !== filterCategory) {
        continue;
      }

      const sub = subjectMap.get(f.subjectId);
      const chap = chapterMap.get(f.chapterId);

      const fileName = (f.name || '').toLowerCase();
      const subName = (sub?.name || '').toLowerCase();
      const chapTitle = (chap?.title || '').toLowerCase();

      if (!q || fileName.includes(q) || subName.includes(q) || chapTitle.includes(q)) {
        results.push({
          ...f,
          subjectName: sub ? sub.name : `Subject`,
          subjectColor: sub ? sub.color : '#FFD000',
          chapterTitle: chap ? chap.title : `Chapter`,
          chapterNumber: chap ? chap.chapterNumber : 1
        });
      }
    }

    return results;
  }

  // ==================== BACKUP & RESTORE ====================
  // Convert Blob or File to Base64 Data URL for JSON serialization
  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(blob);
    });
  }

  // Convert Base64 Data URL back to Blob
  function dataURLToBlob(dataurl) {
    const arr = dataurl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  }

  async function exportBackup() {
    await openDB();
    const [subjects, chapters, files, recent] = await Promise.all([
      txOp('subjects', 'readonly', (s, res) => s.getAll().onsuccess = (e) => res(e.target.result || [])),
      txOp('chapters', 'readonly', (s, res) => s.getAll().onsuccess = (e) => res(e.target.result || [])),
      txOp('files', 'readonly', (s, res) => s.getAll().onsuccess = (e) => res(e.target.result || [])),
      txOp('recent', 'readonly', (s, res) => s.getAll().onsuccess = (e) => res(e.target.result || []))
    ]);

    // Serialize file blobs to base64
    const serializedFiles = [];
    for (const f of files) {
      let dataUrl = f.dataUrl;
      if (!dataUrl && f.blob) {
        dataUrl = await blobToDataURL(f.blob);
      }
      serializedFiles.push({
        id: f.id,
        name: f.name,
        category: f.category,
        type: f.type,
        size: f.size,
        classId: f.classId,
        subjectId: f.subjectId,
        chapterId: f.chapterId,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
        dataUrl: dataUrl
      });
    }

    const backupData = {
      app: 'Study hub',
      version: 1,
      exportedAt: new Date().toISOString(),
      timestamp: Date.now(),
      data: {
        subjects,
        chapters,
        files: serializedFiles,
        recent
      }
    };

    return JSON.stringify(backupData, null, 2);
  }

  async function importBackup(jsonString, overwrite = true) {
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (e) {
      throw new Error('Invalid JSON file format. Please upload a valid Study hub backup.');
    }

    if (!parsed || !parsed.data) {
      throw new Error('Unrecognized backup format. Missing data payload.');
    }

    await openDB();

    if (overwrite) {
      // Clear existing records
      await Promise.all([
        txOp('subjects', 'readwrite', (s, res) => s.clear().onsuccess = () => res()),
        txOp('chapters', 'readwrite', (s, res) => s.clear().onsuccess = () => res()),
        txOp('files', 'readwrite', (s, res) => s.clear().onsuccess = () => res()),
        txOp('recent', 'readwrite', (s, res) => s.clear().onsuccess = () => res())
      ]);
    }

    const { subjects = [], chapters = [], files = [], recent = [] } = parsed.data;

    // Restore subjects
    if (subjects.length > 0) {
      await txOp('subjects', 'readwrite', (store, resolve) => {
        let count = 0;
        subjects.forEach(sub => {
          store.put(sub).onsuccess = () => {
            count++;
            if (count === subjects.length) resolve();
          };
        });
      });
    }

    // Restore chapters
    if (chapters.length > 0) {
      await txOp('chapters', 'readwrite', (store, resolve) => {
        let count = 0;
        chapters.forEach(chap => {
          store.put(chap).onsuccess = () => {
            count++;
            if (count === chapters.length) resolve();
          };
        });
      });
    }

    // Restore files
    if (files.length > 0) {
      for (const f of files) {
        let blob = f.blob;
        if (!blob && f.dataUrl) {
          blob = dataURLToBlob(f.dataUrl);
        }
        const fileRecord = {
          ...f,
          blob: blob || new Blob([], { type: f.type || 'application/octet-stream' })
        };
        await txOp('files', 'readwrite', (store, resolve) => {
          store.put(fileRecord).onsuccess = () => resolve();
        });
      }
    }

    // Restore recent
    if (recent.length > 0) {
      await txOp('recent', 'readwrite', (store, resolve) => {
        let count = 0;
        recent.forEach(r => {
          store.put(r).onsuccess = () => {
            count++;
            if (count === recent.length) resolve();
          };
        });
      });
    }

    return {
      subjectsCount: subjects.length,
      chaptersCount: chapters.length,
      filesCount: files.length
    };
  }

  // Clear all data
  async function clearAllData() {
    await openDB();
    await Promise.all([
      txOp('subjects', 'readwrite', (s, res) => s.clear().onsuccess = () => res()),
      txOp('chapters', 'readwrite', (s, res) => s.clear().onsuccess = () => res()),
      txOp('files', 'readwrite', (s, res) => s.clear().onsuccess = () => res()),
      txOp('recent', 'readwrite', (s, res) => s.clear().onsuccess = () => res())
    ]);
  }

  return {
    openDB,
    // Subjects
    getAllSubjects,
    getSubjectsByClass,
    getSubject,
    addSubject,
    updateSubject,
    deleteSubject,
    // Chapters
    getChaptersBySubject,
    getChapter,
    addChapter,
    updateChapter,
    deleteChapter,
    // Files
    getFilesByChapterAndCategory,
    getAllFilesByChapter,
    getFile,
    addFile,
    updateFileName,
    deleteFile,
    // Recent
    addRecentFile,
    getRecentFiles,
    // Stats & Search
    getAppStats,
    searchMaterials,
    // Backup
    exportBackup,
    importBackup,
    clearAllData,
    // Utility
    blobToDataURL,
    dataURLToBlob
  };
})();
