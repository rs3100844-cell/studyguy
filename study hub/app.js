/**
 * Study hub — Main Application Controller
 * Handles routing, UI rendering, event listeners, file uploads, modals,
 * PDF preview, lightbox gallery, search, and storage metrics.
 */

const StudyApp = (function() {
  // Application State
  const state = {
    currentRoute: 'dashboard',
    routeParams: {},
    activeMaterialTab: 'notes', // 'notes' | 'images' | 'ebook'
    lightboxImages: [],
    lightboxCurrentIndex: 0,
    lightboxZoom: 1,
    pendingDeleteAction: null
  };

  // Color options for Subjects
  const SUBJECT_COLORS = [
    '#FFD000', // Yellow primary
    '#38BDF8', // Sky Blue
    '#4ADE80', // Emerald Green
    '#A855F7', // Purple
    '#FB7185', // Rose
    '#FB923C', // Orange
    '#2DD4BF', // Teal
    '#818CF8'  // Indigo
  ];

  // ==================== INITIALIZATION ====================
  async function init() {
    try {
      await StudyHubDB.openDB();
      setupEventListeners();
      await renderSidebarSubjects();
      updateSidebarStats();

      // Check if DB is completely empty; if so, offer or auto-load sample data for smooth first-time experience
      const stats = await StudyHubDB.getAppStats();
      if (stats.totalSubjects === 0 && !localStorage.getItem('studyhub_initialized')) {
        await SampleDataGenerator.loadDemoStarterPack();
        localStorage.setItem('studyhub_initialized', 'true');
        showToast('Demo study pack loaded! Welcome to Study hub.', 'success');
      }

      // Handle initial URL hash
      handleRouting();
      window.addEventListener('hashchange', handleRouting);
    } catch (err) {
      console.error('App initialization error:', err);
      showToast('Could not load local storage: ' + err.message, 'error');
    }
  }

  // ==================== EVENT LISTENERS ====================
  function setupEventListeners() {
    // Prevent accidental browser navigation when dragging files outside the dropzone
    window.addEventListener('dragover', (e) => e.preventDefault(), false);
    window.addEventListener('drop', (e) => e.preventDefault(), false);

    // Mobile sidebar toggle
    const toggleBtn = document.getElementById('sidebarToggleBtn');
    const closeBtn = document.getElementById('sidebarCloseBtn');
    const sidebar = document.getElementById('appSidebar');

    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => sidebar.classList.toggle('open'));
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', () => sidebar.classList.remove('open'));
    }

    // Global Search keyboard shortcut '/'
    window.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault();
        const searchInput = document.getElementById('globalSearchInput');
        if (searchInput) searchInput.focus();
      } else if (e.key === 'Escape') {
        closeAllModals();
      } else if (e.key === 'ArrowRight' && isModalOpen('imageLightboxModal')) {
        nextLightboxImage();
      } else if (e.key === 'ArrowLeft' && isModalOpen('imageLightboxModal')) {
        prevLightboxImage();
      }
    });

    // Topbar Search input handling
    const searchInput = document.getElementById('globalSearchInput');
    const searchDropdown = document.getElementById('searchResultsDropdown');

    if (searchInput) {
      let debounceTimeout;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimeout);
        const query = e.target.value.trim();
        if (!query) {
          if (searchDropdown) searchDropdown.style.display = 'none';
          return;
        }
        debounceTimeout = setTimeout(() => handleGlobalSearchType(query), 180);
      });

      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const query = searchInput.value.trim();
          if (query) {
            if (searchDropdown) searchDropdown.style.display = 'none';
            navigateTo(`search?q=${encodeURIComponent(query)}`);
          }
        }
      });

      // Close search dropdown on click outside
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.topbar-search')) {
          if (searchDropdown) searchDropdown.style.display = 'none';
        }
      });
    }

    // Demo pack loader button
    const demoBtn = document.getElementById('loadDemoDataBtn');
    if (demoBtn) {
      demoBtn.addEventListener('click', async () => {
        if (confirm('Load demo starter pack? This adds sample subjects (Mathematics, Science, Physics, Computer Science) with notes, diagrams, and chapter e-books.')) {
          demoBtn.disabled = true;
          demoBtn.innerHTML = '<span>Loading...</span>';
          try {
            await SampleDataGenerator.loadDemoStarterPack();
            showToast('Demo study materials loaded successfully!', 'success');
            await refreshCurrentView();
            await updateSidebarStats();
          } catch (e) {
            showToast('Failed to load demo pack: ' + e.message, 'error');
          } finally {
            demoBtn.disabled = false;
            demoBtn.innerHTML = `
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4"/><path d="m4.93 4.93 2.83 2.83"/><path d="M2 12h4"/><path d="m4.93 19.07 2.83-2.83"/><path d="M12 18v4"/><path d="m19.07 19.07-2.83-2.83"/><path d="M18 12h4"/><path d="m19.07 4.93-2.83 2.83"/></svg>
              <span>Demo Pack</span>`;
          }
        }
      });
    }

    // Lightbox Controls
    const prevBtn = document.getElementById('lightboxPrevBtn');
    const nextBtn = document.getElementById('lightboxNextBtn');
    const zoomInBtn = document.getElementById('lightboxZoomIn');
    const zoomOutBtn = document.getElementById('lightboxZoomOut');
    const zoomResetBtn = document.getElementById('lightboxZoomReset');

    if (prevBtn) prevBtn.addEventListener('click', prevLightboxImage);
    if (nextBtn) nextBtn.addEventListener('click', nextLightboxImage);
    if (zoomInBtn) zoomInBtn.addEventListener('click', () => setLightboxZoom(state.lightboxZoom + 0.25));
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => setLightboxZoom(state.lightboxZoom - 0.25));
    if (zoomResetBtn) zoomResetBtn.addEventListener('click', () => setLightboxZoom(1));

    // Initialize Subject Color Picker inside Modal
    initColorPicker();
  }

  // ==================== ROUTING ====================
  function navigateTo(hashPath) {
    window.location.hash = hashPath.startsWith('/') ? hashPath : '/' + hashPath;
  }

  async function handleRouting() {
    // Close mobile sidebar on route change
    const sidebar = document.getElementById('appSidebar');
    if (sidebar) sidebar.classList.remove('open');

    const hash = window.location.hash.replace(/^#\/?/, '');
    const [pathPart, queryPart] = hash.split('?');
    const segments = pathPart ? pathPart.split('/') : ['dashboard'];
    const rootRoute = segments[0] || 'dashboard';

    // Parse query params
    const queryParams = {};
    if (queryPart) {
      new URLSearchParams(queryPart).forEach((val, key) => {
        queryParams[key] = val;
      });
    }

    state.currentRoute = rootRoute;
    state.routeParams = {
      segments,
      queryParams,
      subjectId: segments[1] && rootRoute === 'subject' ? segments[1] : null,
      chapterId: segments[1] && rootRoute === 'chapter' ? segments[1] : null
    };

    updateActiveNavLinks();
    await renderRoute();
  }

  function updateActiveNavLinks() {
    // Update main nav items
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
      const route = item.getAttribute('data-route');
      if (route === state.currentRoute) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Update subject links in sidebar
    document.querySelectorAll('.sidebar-subject-link').forEach(link => {
      const sId = link.getAttribute('data-subject-id');
      if (state.currentRoute === 'subject' && state.routeParams.subjectId === sId) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }

  async function renderRoute() {
    const content = document.getElementById('contentArea');
    if (!content) return;

    switch (state.currentRoute) {
      case 'dashboard':
        await renderDashboardView(content);
        break;
      case 'subject':
        await renderSubjectView(content, state.routeParams.subjectId);
        break;
      case 'chapter':
        await renderChapterView(content, state.routeParams.chapterId);
        break;
      case 'recent':
        await renderRecentView(content);
        break;
      case 'search':
        await renderSearchView(content, state.routeParams.queryParams);
        break;
      case 'backup':
        await renderBackupView(content);
        break;
      default:
        await renderDashboardView(content);
    }

    updateSidebarStats();
  }

  async function refreshCurrentView() {
    await renderRoute();
  }

  // ==================== BREADCRUMBS ====================
  function setBreadcrumbs(items = []) {
    const bc = document.getElementById('appBreadcrumbs');
    if (!bc) return;

    let html = `
      <div class="bc-item">
        <a href="#/dashboard">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -2px; margin-right: 4px;"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          Dashboard
        </a>
      </div>
    `;

    items.forEach((item, index) => {
      const isLast = index === items.length - 1;
      html += `<span class="bc-separator">/</span>`;
      if (isLast || !item.url) {
        html += `<div class="bc-item current">${escapeHtml(item.label)}</div>`;
      } else {
        html += `<div class="bc-item"><a href="${item.url}">${escapeHtml(item.label)}</a></div>`;
      }
    });

    bc.innerHTML = html;
  }

  // ==================== 1. DASHBOARD VIEW ====================
  async function renderDashboardView(container) {
    setBreadcrumbs([]);

    const stats = await StudyHubDB.getAppStats();
    const recentFiles = await StudyHubDB.getRecentFiles(6);
    const subjects = await StudyHubDB.getAllSubjects();

    // Fetch chapter & file counts for each subject
    const subjectCardPromises = subjects.map(async (sub) => {
      const chapters = await StudyHubDB.getChaptersBySubject(sub.id);
      let fileCount = 0;
      for (const ch of chapters) {
        const files = await StudyHubDB.getAllFilesByChapter(ch.id);
        fileCount += files.length;
      }
      return {
        ...sub,
        chapterCount: chapters.length,
        fileCount
      };
    });

    const subjectsWithCounts = await Promise.all(subjectCardPromises);

    // Subject Cards HTML
    let subjectsHtml = '';
    if (subjectsWithCounts.length === 0) {
      subjectsHtml = `
        <div class="empty-state-box">
          <div class="empty-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          </div>
          <h3 class="empty-title">No Subjects Added Yet</h3>
          <p class="empty-desc">Create your first subject (like Mathematics, Science, English, or History) to start adding chapters and study materials.</p>
          <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
            <button class="btn btn-yellow" onclick="StudyApp.openAddSubjectModal()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add First Subject
            </button>
            <button class="btn btn-secondary" onclick="document.getElementById('loadDemoDataBtn').click()">
              Load Demo Pack
            </button>
          </div>
        </div>
      `;
    } else {
      subjectsHtml = `
        <div class="subjects-grid">
          ${subjectsWithCounts.map(sub => `
            <div class="subject-card" onclick="StudyApp.navigateTo('subject/${sub.id}')">
              <div class="subject-card-top">
                <div style="flex: 1; min-width: 0;">
                  <div style="display: flex; align-items: center; margin-bottom: 6px;">
                    <span class="subject-color-bar" style="background-color: ${sub.color || '#FFD000'};"></span>
                    <span style="font-size: 0.76rem; text-transform: uppercase; font-weight: 700; color: var(--text-muted); letter-spacing: 0.05em;">Subject</span>
                  </div>
                  <h3 class="subject-card-title">${escapeHtml(sub.name)}</h3>
                  ${sub.description ? `<p class="subject-card-desc">${escapeHtml(sub.description)}</p>` : ''}
                </div>
                <div class="card-action-menu" onclick="event.stopPropagation()">
                  <button class="icon-btn" title="Edit Subject" onclick="StudyApp.openEditSubjectModal('${sub.id}')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button class="icon-btn" title="Delete Subject" onclick="StudyApp.confirmDeleteSubject('${sub.id}', '${escapeHtml(sub.name)}')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>

              <div class="subject-card-stats">
                <div class="subject-stat-item">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  <span><strong>${sub.chapterCount}</strong> Chapters</span>
                </div>
                <div class="subject-stat-item">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/></svg>
                  <span><strong>${sub.fileCount}</strong> Materials</span>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    // Recent Files HTML
    let recentHtml = '';
    if (recentFiles.length > 0) {
      recentHtml = `
        <div class="recently-opened-container">
          <div class="section-heading-row">
            <h3 class="section-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Recently Opened Materials
            </h3>
            <a href="#/recent" class="btn btn-ghost btn-sm">View All (${recentFiles.length}) →</a>
          </div>
          <div class="recent-files-list">
            ${recentFiles.map(rf => `
              <div class="recent-file-card" onclick="StudyApp.openFileById('${rf.id}')">
                <div class="recent-file-info">
                  <span class="file-badge ${getFileBadgeClass(rf.category)}">${getFileCategoryLabel(rf.category)}</span>
                  <div class="recent-file-text">
                    <div class="recent-file-title" title="${escapeHtml(rf.name)}">${escapeHtml(rf.name)}</div>
                    <div class="recent-file-sub">${formatBytes(rf.size)}</div>
                  </div>
                </div>
                <span class="recent-file-time">${formatTimeAgo(rf.openedAt)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      <!-- HERO WELCOME -->
      <section class="dashboard-hero">
        <div class="hero-content">
          <span class="hero-pill">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            Student Workspace
          </span>
          <h1 class="hero-title">Organise Your Studies with <span class="yellow-text">Study hub</span></h1>
          <p class="hero-desc">Access Notes, E-books, and Image diagrams across all your subjects. Everything is stored securely on your browser with offline persistence.</p>
          <div class="hero-actions">
            <button class="btn btn-yellow" onclick="StudyApp.openAddSubjectModal()">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span>Add Subject</span>
            </button>
            <a href="#/search" class="btn btn-secondary">Find Materials</a>
            <a href="#/recent" class="btn btn-dark">Recently Opened</a>
          </div>
        </div>
        <div class="hero-decorative-badge">
          <div class="hero-badge-inner">
            <span class="hero-badge-val">${stats.totalFiles}</span>
            <span class="hero-badge-lbl">Saved Files</span>
          </div>
        </div>
      </section>

      <!-- STATS COUNTERS -->
      <section class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon yellow">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          </div>
          <div class="stat-content">
            <span class="stat-value">${stats.totalSubjects}</span>
            <span class="stat-label">Total Subjects</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon black">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/></svg>
          </div>
          <div class="stat-content">
            <span class="stat-value">${stats.totalChapters}</span>
            <span class="stat-label">Total Chapters</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon blue">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
          </div>
          <div class="stat-content">
            <span class="stat-value">${stats.totalFiles}</span>
            <span class="stat-label">Study Materials</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon green">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/></svg>
          </div>
          <div class="stat-content">
            <span class="stat-value">${formatBytes(stats.totalBytes)}</span>
            <span class="stat-label">Stored Locally</span>
          </div>
        </div>
      </section>

      <!-- RECENTLY OPENED -->
      ${recentHtml}

      <!-- SUBJECTS DIRECTORY -->
      <section>
        <div class="section-heading-row">
          <div style="display: flex; align-items: center; gap: 10px;">
            <h2 class="section-title">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              Your Subjects
            </h2>
            <span class="section-tag">${subjectsWithCounts.length} Available</span>
          </div>
          <button class="btn btn-yellow btn-sm" onclick="StudyApp.openAddSubjectModal()">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span>Add Subject</span>
          </button>
        </div>
        ${subjectsHtml}
      </section>
    `;
  }

  // ==================== 2. SUBJECT VIEW (SHOW CHAPTERS) ====================
  async function renderSubjectView(container, subjectId) {
    const subject = await StudyHubDB.getSubject(subjectId);
    if (!subject) {
      showToast('Subject not found', 'error');
      navigateTo('dashboard');
      return;
    }

    setBreadcrumbs([
      { label: subject.name, url: `#/subject/${subject.id}` }
    ]);

    const chapters = await StudyHubDB.getChaptersBySubject(subject.id);

    // Get breakdown of files for each chapter
    const chapterCardsPromises = chapters.map(async (chap) => {
      const notes = await StudyHubDB.getFilesByChapterAndCategory(chap.id, 'notes');
      const images = await StudyHubDB.getFilesByChapterAndCategory(chap.id, 'images');
      const ebooks = await StudyHubDB.getFilesByChapterAndCategory(chap.id, 'ebook');
      return {
        ...chap,
        notesCount: notes.length,
        imagesCount: images.length,
        ebookCount: ebooks.length,
        totalFiles: notes.length + images.length + ebooks.length
      };
    });

    const chaptersWithCounts = await Promise.all(chapterCardsPromises);

    let contentHtml = '';
    if (chaptersWithCounts.length === 0) {
      contentHtml = `
        <div class="empty-state-box">
          <div class="empty-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <h3 class="empty-title">No Chapters Added Yet</h3>
          <p class="empty-desc">Add chapters to "${escapeHtml(subject.name)}" to organise PDF notes, image diagrams, and chapter e-books.</p>
          <button class="btn btn-yellow" onclick="StudyApp.openAddChapterModal('${subject.id}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Chapter 1
          </button>
        </div>
      `;
    } else {
      contentHtml = `
        <div class="chapters-grid">
          ${chaptersWithCounts.map(chap => `
            <div class="chapter-card" onclick="StudyApp.navigateTo('chapter/${chap.id}')">
              <div>
                <div style="display: flex; align-items: flex-start; justify-content: space-between;">
                  <span class="chapter-badge-num">Chapter ${chap.chapterNumber}</span>
                  <div class="card-action-menu" onclick="event.stopPropagation()">
                    <button class="icon-btn" title="Edit Chapter" onclick="StudyApp.openEditChapterModal('${chap.id}')">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="icon-btn" title="Delete Chapter" onclick="StudyApp.confirmDeleteChapter('${chap.id}', 'Chapter ${chap.chapterNumber}: ${escapeHtml(chap.title)}')">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </div>
                </div>
                <h3 class="chapter-title">${escapeHtml(chap.title)}</h3>
                ${chap.description ? `<p class="chapter-desc">${escapeHtml(chap.description)}</p>` : ''}
              </div>

              <div class="chapter-materials-summary">
                <span class="material-count-pill" title="PDF Notes">
                  📝 ${chap.notesCount} Notes
                </span>
                <span class="material-count-pill" title="Image Diagrams">
                  🖼️ ${chap.imagesCount} Images
                </span>
                <span class="material-count-pill" title="E-books">
                  📖 ${chap.ebookCount} E-book
                </span>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    container.innerHTML = `
      <div class="view-header">
        <div class="view-header-main">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
            <span class="subject-color-bar" style="background-color: ${subject.color || '#FFD000'}; width: 14px; height: 14px;"></span>
            <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Subject</span>
          </div>
          <h1 class="view-title">${escapeHtml(subject.name)}</h1>
          <p class="view-subtitle">${subject.description ? escapeHtml(subject.description) : 'Browse chapters, notes and books.'}</p>
        </div>
        <div class="view-header-actions">
          <button class="btn btn-secondary" onclick="StudyApp.openEditSubjectModal('${subject.id}')" title="Edit Subject">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            <span>Edit</span>
          </button>
          <button class="btn btn-yellow" onclick="StudyApp.openAddChapterModal('${subject.id}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span>Add Chapter</span>
          </button>
        </div>
      </div>

      ${contentHtml}
    `;
  }

  // ==================== 3. CHAPTER VIEW (STUDY MATERIALS WORKSPACE) ====================
  async function renderChapterView(container, chapterId) {
    const chapter = await StudyHubDB.getChapter(chapterId);
    if (!chapter) {
      showToast('Chapter not found', 'error');
      navigateTo('dashboard');
      return;
    }

    const subject = await StudyHubDB.getSubject(chapter.subjectId);

    setBreadcrumbs([
      { label: subject ? subject.name : 'Subject', url: subject ? `#/subject/${subject.id}` : null },
      { label: `Ch ${chapter.chapterNumber}: ${chapter.title}`, url: `#/chapter/${chapter.id}` }
    ]);

    const activeTab = state.activeMaterialTab || 'notes';

    // Counts for tabs
    const [notes, images, ebooks] = await Promise.all([
      StudyHubDB.getFilesByChapterAndCategory(chapter.id, 'notes'),
      StudyHubDB.getFilesByChapterAndCategory(chapter.id, 'images'),
      StudyHubDB.getFilesByChapterAndCategory(chapter.id, 'ebook')
    ]);

    // Render tab section content
    let tabContentHtml = '';
    if (activeTab === 'notes') {
      tabContentHtml = renderNotesTab(notes, chapter);
    } else if (activeTab === 'images') {
      tabContentHtml = renderImagesTab(images, chapter);
    } else if (activeTab === 'ebook') {
      tabContentHtml = renderEbookTab(ebooks, chapter);
    }

    container.innerHTML = `
      <!-- CHAPTER BANNER -->
      <div class="chapter-hero-box">
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
            <span class="chapter-badge-num">Chapter ${chapter.chapterNumber}</span>
            <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted);">${subject ? escapeHtml(subject.name) : 'Subject'}</span>
          </div>
          <h1 class="view-title">${escapeHtml(chapter.title)}</h1>
          ${chapter.description ? `<p class="view-subtitle">${escapeHtml(chapter.description)}</p>` : ''}
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-secondary btn-sm" onclick="StudyApp.openEditChapterModal('${chapter.id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            <span>Edit Info</span>
          </button>
        </div>
      </div>

      <!-- TABS NAVIGATION -->
      <div class="materials-tab-nav">
        <button class="material-tab-btn ${activeTab === 'notes' ? 'active' : ''}" onclick="StudyApp.switchMaterialTab('notes')">
          <span>📝 Notes (PDF)</span>
          <span class="tab-badge">${notes.length}</span>
        </button>
        <button class="material-tab-btn ${activeTab === 'images' ? 'active' : ''}" onclick="StudyApp.switchMaterialTab('images')">
          <span>🖼️ Image Notes</span>
          <span class="tab-badge">${images.length}</span>
        </button>
        <button class="material-tab-btn ${activeTab === 'ebook' ? 'active' : ''}" onclick="StudyApp.switchMaterialTab('ebook')">
          <span>📖 Chapter E-book</span>
          <span class="tab-badge">${ebooks.length}</span>
        </button>
      </div>

      <!-- TAB CONTENT -->
      <div class="tab-body-container">
        ${tabContentHtml}
      </div>
    `;

    // Attach drag & drop listeners to the active dropzone
    setupDropzoneListeners(chapter.id, activeTab);
  }

  function switchMaterialTab(tabName) {
    state.activeMaterialTab = tabName;
    renderRoute();
  }

  // --- Render Notes Tab (PDF) ---
  function renderNotesTab(files, chapter) {
    const fileGrid = files.length === 0 ? `
      <div class="empty-state-box" style="padding: 32px 20px;">
        <h4 class="empty-title">No Notes Uploaded</h4>
        <p class="empty-desc">Upload summary notes, formula sheets, or revision handouts (PDF format).</p>
      </div>
    ` : `
      <div class="materials-grid">
        ${files.map(f => renderFileCard(f)).join('')}
      </div>
    `;

    return `
      <!-- Upload Dropzone -->
      <div class="file-upload-dropzone" id="materialDropzone">
        <input type="file" id="materialFileInput" accept=".pdf,application/pdf" multiple style="display: none;">
        <div class="dropzone-icon">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        </div>
        <div class="dropzone-title">Upload Multiple Notes (PDF)</div>
        <div class="dropzone-subtitle">Drag and drop your PDF notes here, or browse files from computer</div>
        <button type="button" class="btn btn-yellow btn-sm dropzone-btn" onclick="document.getElementById('materialFileInput').click()">
          Browse PDF Notes
        </button>
      </div>

      ${fileGrid}
    `;
  }

  // --- Render Image Notes Tab (JPG, PNG, WEBP) ---
  function renderImagesTab(files, chapter) {
    // Cache for lightbox gallery
    state.lightboxImages = files;

    const galleryGrid = files.length === 0 ? `
      <div class="empty-state-box" style="padding: 32px 20px;">
        <h4 class="empty-title">No Image Notes Uploaded</h4>
        <p class="empty-desc">Upload diagrams, handwritten notes, flowcharts or formula screenshots (JPG, PNG, WEBP).</p>
      </div>
    ` : `
      <div class="image-gallery-grid">
        ${files.map((img, index) => {
          let imgSrc = '';
          if (img.blob) {
            imgSrc = URL.createObjectURL(img.blob);
          } else if (img.dataUrl) {
            imgSrc = img.dataUrl;
          }

          return `
            <div class="image-card">
              <div class="image-thumb-box" onclick="StudyApp.openImageLightbox(${index})">
                <img src="${imgSrc}" class="image-thumb" alt="${escapeHtml(img.name)}" loading="lazy">
                <div class="image-hover-overlay">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="11" x2="11" y1="8" y2="14"/><line x1="8" x2="14" y1="11" y2="11"/></svg>
                </div>
              </div>
              <div class="image-card-info">
                <div class="image-card-name" title="${escapeHtml(img.name)}">${escapeHtml(img.name)}</div>
                <div class="image-card-footer">
                  <span>${formatBytes(img.size)}</span>
                  <div style="display: flex; gap: 4px;">
                    <button class="icon-btn" style="width: 26px; height: 26px;" title="Download" onclick="StudyApp.downloadFile('${img.id}')">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                    </button>
                    <button class="icon-btn" style="width: 26px; height: 26px;" title="Rename" onclick="StudyApp.openRenameFileModal('${img.id}', '${escapeHtml(img.name)}')">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="icon-btn" style="width: 26px; height: 26px; color: var(--color-danger);" title="Delete" onclick="StudyApp.confirmDeleteFile('${img.id}', '${escapeHtml(img.name)}')">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    return `
      <div class="file-upload-dropzone" id="materialDropzone">
        <input type="file" id="materialFileInput" accept="image/jpeg,image/png,image/webp" multiple style="display: none;">
        <div class="dropzone-icon">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
        </div>
        <div class="dropzone-title">Upload Image Notes (JPG, PNG, WEBP)</div>
        <div class="dropzone-subtitle">Upload multiple diagrams or notes screenshots into the gallery</div>
        <button type="button" class="btn btn-yellow btn-sm dropzone-btn" onclick="document.getElementById('materialFileInput').click()">
          Browse Images
        </button>
      </div>

      ${galleryGrid}
    `;
  }

  // --- Render E-Book Tab (PDF) ---
  function renderEbookTab(files, chapter) {
    const fileGrid = files.length === 0 ? `
      <div class="empty-state-box" style="padding: 32px 20px;">
        <h4 class="empty-title">No Chapter E-Book Uploaded</h4>
        <p class="empty-desc">Upload complete textbook chapter PDFs or reference books for this chapter.</p>
      </div>
    ` : `
      <div class="materials-grid">
        ${files.map(f => renderFileCard(f, true)).join('')}
      </div>
    `;

    return `
      <div class="file-upload-dropzone" id="materialDropzone">
        <input type="file" id="materialFileInput" accept=".pdf,application/pdf" multiple style="display: none;">
        <div class="dropzone-icon">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
        </div>
        <div class="dropzone-title">Upload Chapter E-Book (PDF)</div>
        <div class="dropzone-subtitle">Attach official NCERT or reference textbook PDF for this chapter</div>
        <button type="button" class="btn btn-yellow btn-sm dropzone-btn" onclick="document.getElementById('materialFileInput').click()">
          Browse E-Book PDF
        </button>
      </div>

      ${fileGrid}
    `;
  }

  // Common file card renderer for PDF notes and ebooks
  function renderFileCard(file, isEbook = false) {
    return `
      <div class="file-item-card">
        <div class="file-item-top">
          <div class="file-type-icon ${isEbook ? 'ebook-icon' : ''}">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <div class="file-item-details">
            <h4 class="file-item-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</h4>
            <div class="file-item-meta">
              <span>${formatBytes(file.size)}</span>
              <span>•</span>
              <span>${new Date(file.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        <div class="file-item-actions">
          <button class="btn btn-yellow btn-sm" onclick="StudyApp.previewPDF('${file.id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            <span>Preview</span>
          </button>
          <div class="file-btn-group">
            <button class="icon-btn" title="Download File" onclick="StudyApp.downloadFile('${file.id}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
            </button>
            <button class="icon-btn" title="Rename" onclick="StudyApp.openRenameFileModal('${file.id}', '${escapeHtml(file.name)}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="icon-btn" style="color: var(--color-danger);" title="Delete" onclick="StudyApp.confirmDeleteFile('${file.id}', '${escapeHtml(file.name)}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // Setup Dropzone Drag and Drop + File Input
  function setupDropzoneListeners(chapterId, category) {
    const dropzone = document.getElementById('materialDropzone');
    const fileInput = document.getElementById('materialFileInput');
    if (!dropzone || !fileInput) return;

    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('dragover');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('dragover');
      }, false);
    });

    dropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      handleFilesUpload(files, chapterId, category);
    });

    fileInput.addEventListener('change', (e) => {
      handleFilesUpload(e.target.files, chapterId, category);
      fileInput.value = ''; // Reset input
    });
  }

  async function handleFilesUpload(fileList, chapterId, category) {
    if (!fileList || fileList.length === 0) return;

    const chapter = await StudyHubDB.getChapter(chapterId);
    if (!chapter) return;

    const allowedMimes = {
      notes: ['application/pdf'],
      images: ['image/jpeg', 'image/png', 'image/webp'],
      ebook: ['application/pdf']
    };

    let uploadedCount = 0;
    let skippedCount = 0;

    for (const file of Array.from(fileList)) {
      // Validate format
      const validTypes = allowedMimes[category] || [];
      const isPdfExtension = file.name.toLowerCase().endsWith('.pdf');
      const isImgExtension = /\.(jpe?g|png|webp)$/i.test(file.name);

      let isValid = false;
      if (category === 'notes' || category === 'ebook') {
        isValid = validTypes.includes(file.type) || isPdfExtension;
      } else if (category === 'images') {
        isValid = validTypes.includes(file.type) || isImgExtension;
      }

      if (!isValid) {
        skippedCount++;
        continue;
      }

      await StudyHubDB.addFile({
        subjectId: chapter.subjectId,
        chapterId: chapter.id,
        category: category,
        name: file.name,
        type: file.type || (category === 'images' ? 'image/png' : 'application/pdf'),
        size: file.size,
        blob: file
      });
      uploadedCount++;
    }

    if (uploadedCount > 0) {
      showToast(`Uploaded ${uploadedCount} file${uploadedCount > 1 ? 's' : ''} successfully!`, 'success');
      await refreshCurrentView();
      await updateSidebarStats();
    }

    if (skippedCount > 0) {
      showToast(`Skipped ${skippedCount} file(s) with unsupported format for this section.`, 'error');
    }
  }

  // ==================== 4. RECENTLY OPENED VIEW ====================
  async function renderRecentView(container) {
    setBreadcrumbs([
      { label: 'Recently Opened', url: '#/recent' }
    ]);

    const [recentFiles, subjects, chapters] = await Promise.all([
      StudyHubDB.getRecentFiles(50),
      StudyHubDB.getAllSubjects(),
      StudyHubDB.openDB().then(db => new Promise(res => {
        const tx = db.transaction('chapters', 'readonly');
        tx.objectStore('chapters').getAll().onsuccess = (e) => res(e.target.result || []);
      }))
    ]);

    const subjectMap = new Map();
    subjects.forEach(s => subjectMap.set(s.id, s));
    const chapterMap = new Map();
    chapters.forEach(c => chapterMap.set(c.id, c));

    let listHtml = '';
    if (recentFiles.length === 0) {
      listHtml = `
        <div class="empty-state-box">
          <div class="empty-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <h3 class="empty-title">No Recently Opened Files</h3>
          <p class="empty-desc">Files you preview or open will appear here for rapid 1-click access.</p>
          <a href="#/dashboard" class="btn btn-yellow">Go to Dashboard</a>
        </div>
      `;
    } else {
      listHtml = `
        <div class="materials-grid">
          ${recentFiles.map(rf => {
            const sub = subjectMap.get(rf.subjectId);
            const chap = chapterMap.get(rf.chapterId);
            return `
            <div class="file-item-card">
              <div class="file-item-top">
                <span class="file-badge ${getFileBadgeClass(rf.category)}">${getFileCategoryLabel(rf.category)}</span>
                <div class="file-item-details" style="margin-left: 10px;">
                  <h4 class="file-item-name" title="${escapeHtml(rf.name)}">${escapeHtml(rf.name)}</h4>
                  <div class="file-item-meta">
                    <span>${escapeHtml(sub ? sub.name : 'Subject')}</span>
                    ${chap ? `<span>•</span><span>Ch ${chap.chapterNumber}: ${escapeHtml(chap.title)}</span>` : ''}
                    <span>•</span>
                    <span>${formatBytes(rf.size)}</span>
                  </div>
                </div>
              </div>
              <div class="file-item-actions">
                <span style="font-size: 0.75rem; color: var(--text-muted);">
                  ${formatTimeAgo(rf.openedAt)}
                </span>
                <div class="file-btn-group">
                  <button class="btn btn-yellow btn-sm" onclick="StudyApp.openFileById('${rf.id}')">
                    Open File
                  </button>
                  <a href="#/chapter/${rf.chapterId}" class="btn btn-secondary btn-sm" title="Go to Chapter">
                    Chapter →
                  </a>
                </div>
              </div>
            </div>
          `;}).join('')}
        </div>
      `;
    }

    container.innerHTML = `
      <div class="view-header">
        <div class="view-header-main">
          <h1 class="view-title">Recently Opened Materials</h1>
          <p class="view-subtitle">Quickly resume reading your recently accessed notes, textbooks, and diagrams.</p>
        </div>
      </div>
      ${listHtml}
    `;
  }

  // ==================== 5. SEARCH VIEW ====================
  async function renderSearchView(container, params = {}) {
    setBreadcrumbs([
      { label: 'Search Materials', url: '#/search' }
    ]);

    const initialQuery = params.q || '';
    const initialSubject = params.subject || 'all';
    const initialType = params.type || 'all';

    const subjects = await StudyHubDB.getAllSubjects();

    container.innerHTML = `
      <div class="view-header">
        <div class="view-header-main">
          <h1 class="view-title">Find Study Materials</h1>
          <p class="view-subtitle">Instant search across all subjects, chapters, notes, and e-books.</p>
        </div>
      </div>

      <!-- SEARCH FILTERS BAR -->
      <div style="background: #FFFFFF; border: 1px solid var(--border-card); border-radius: var(--radius-lg); padding: 20px; margin-bottom: 24px; box-shadow: var(--shadow-sm);">
        <div style="display: flex; gap: 14px; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 250px;">
            <label class="form-label">Search Keywords</label>
            <input type="text" id="pageSearchQuery" class="form-control" placeholder="Type filename, chapter name or subject..." value="${escapeHtml(initialQuery)}">
          </div>
          <div style="width: 200px;">
            <label class="form-label">Filter by Subject</label>
            <select id="pageSearchSubject" class="form-control">
              <option value="all">All Subjects</option>
              ${subjects.map(s => `<option value="${s.id}" ${initialSubject === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
            </select>
          </div>
          <div style="width: 170px;">
            <label class="form-label">Material Type</label>
            <select id="pageSearchType" class="form-control">
              <option value="all">All Types</option>
              <option value="notes" ${initialType === 'notes' ? 'selected' : ''}>Notes (PDF)</option>
              <option value="images" ${initialType === 'images' ? 'selected' : ''}>Image Notes</option>
              <option value="ebook" ${initialType === 'ebook' ? 'selected' : ''}>Chapter E-books</option>
            </select>
          </div>
        </div>
      </div>

      <div id="searchResultsListContainer">
        <!-- Rendered results -->
      </div>
    `;

    // Attach listeners
    const qInput = document.getElementById('pageSearchQuery');
    const sSelect = document.getElementById('pageSearchSubject');
    const tSelect = document.getElementById('pageSearchType');

    const executeSearch = async () => {
      const q = qInput.value;
      const s = sSelect.value === 'all' ? null : sSelect.value;
      const t = tSelect.value;
      await performPageSearch(q, s, t);
    };

    qInput.addEventListener('input', executeSearch);
    sSelect.addEventListener('change', executeSearch);
    tSelect.addEventListener('change', executeSearch);

    await executeSearch();
  }

  async function performPageSearch(query, filterSubject, filterType) {
    const listContainer = document.getElementById('searchResultsListContainer');
    if (!listContainer) return;

    const results = await StudyHubDB.searchMaterials(query, filterSubject, filterType);

    if (results.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state-box">
          <div class="empty-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          </div>
          <h3 class="empty-title">No Matching Materials Found</h3>
          <p class="empty-desc">Try searching with a different term, or remove filters to find your study files.</p>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = `
      <div style="margin-bottom: 14px; font-size: 0.88rem; font-weight: 700; color: var(--text-muted);">
        Found ${results.length} material${results.length > 1 ? 's' : ''}
      </div>
      <div class="materials-grid">
        ${results.map(r => `
          <div class="file-item-card">
            <div class="file-item-top">
              <span class="file-badge ${getFileBadgeClass(r.category)}">${getFileCategoryLabel(r.category)}</span>
              <div class="file-item-details" style="margin-left: 10px;">
                <h4 class="file-item-name" title="${escapeHtml(r.name)}">${escapeHtml(r.name)}</h4>
                <div class="file-item-meta">
                  <span>${escapeHtml(r.subjectName)}</span>
                  <span>•</span>
                  <span>Ch ${r.chapterNumber}: ${escapeHtml(r.chapterTitle)}</span>
                </div>
              </div>
            </div>

            <div class="file-item-actions">
              <span style="font-size: 0.75rem; color: var(--text-muted);">${formatBytes(r.size)}</span>
              <div class="file-btn-group">
                <button class="btn btn-yellow btn-sm" onclick="StudyApp.openFileById('${r.id}')">
                  Open
                </button>
                <a href="#/chapter/${r.chapterId}" class="btn btn-secondary btn-sm" title="Go to Chapter">
                  Chapter →
                </a>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // Topbar dropdown live search
  async function handleGlobalSearchType(query) {
    const dropdown = document.getElementById('searchResultsDropdown');
    if (!dropdown) return;

    const results = await StudyHubDB.searchMaterials(query);

    if (results.length === 0) {
      dropdown.innerHTML = `<div class="search-dropdown-empty">No matching study materials found for "${escapeHtml(query)}"</div>`;
      dropdown.style.display = 'block';
      return;
    }

    dropdown.innerHTML = results.slice(0, 8).map(r => `
      <div class="search-dropdown-item" onclick="StudyApp.openFileFromDropdown('${r.id}')">
        <div class="file-meta">
          <span class="file-badge ${getFileBadgeClass(r.category)}">${getFileCategoryLabel(r.category)}</span>
          <div>
            <div class="file-name">${escapeHtml(r.name)}</div>
            <div class="file-path">${escapeHtml(r.subjectName)} • Ch ${r.chapterNumber}: ${escapeHtml(r.chapterTitle)}</div>
          </div>
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-mono);">
          ${formatBytes(r.size)}
        </div>
      </div>
    `).join('') + `
      <div style="padding: 8px; border-top: 1px solid var(--border-light); text-align: center;">
        <a href="#/search?q=${encodeURIComponent(query)}" style="font-size: 0.8rem; font-weight: 700; color: var(--black-900);">
          View all results in search page →
        </a>
      </div>
    `;

    dropdown.style.display = 'block';
  }

  function openFileFromDropdown(fileId) {
    const dropdown = document.getElementById('searchResultsDropdown');
    if (dropdown) dropdown.style.display = 'none';
    openFileById(fileId);
  }

  // ==================== 7. BACKUP & RESTORE VIEW ====================
  async function renderBackupView(container) {
    setBreadcrumbs([
      { label: 'Backup & Restore', url: '#/backup' }
    ]);

    const stats = await StudyHubDB.getAppStats();

    container.innerHTML = `
      <div class="view-header">
        <div class="view-header-main">
          <h1 class="view-title">Storage, Backup & Restore</h1>
          <p class="view-subtitle">Export your complete study database or restore from a previously saved backup file.</p>
        </div>
      </div>

      <div class="backup-grid">
        <!-- EXPORT CARD -->
        <div class="backup-card">
          <div>
            <div class="backup-card-header">
              <div class="backup-card-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
              </div>
              <h3 class="backup-card-title">Export Backup</h3>
            </div>
            <p class="backup-card-desc">
              Download all subjects, chapters, notes, e-books, and images into a single portable backup file. Keep it safe on your PC, Google Drive, or USB drive.
            </p>
            <div style="background: #F8F9FB; border-radius: var(--radius-md); padding: 14px; margin-bottom: 20px; font-size: 0.85rem;">
              <div><strong>${stats.totalSubjects}</strong> Subjects</div>
              <div><strong>${stats.totalChapters}</strong> Chapters</div>
              <div><strong>${stats.totalFiles}</strong> Saved Files (${formatBytes(stats.totalBytes)})</div>
            </div>
          </div>
          <button class="btn btn-yellow btn-lg" id="exportBackupBtn" onclick="StudyApp.handleExportBackup()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
            <span>Download Backup File (.json)</span>
          </button>
        </div>

        <!-- RESTORE CARD -->
        <div class="backup-card">
          <div>
            <div class="backup-card-header">
              <div class="backup-card-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              </div>
              <h3 class="backup-card-title">Import Backup</h3>
            </div>
            <p class="backup-card-desc">
              Restore your complete study setup from a backup file. All subjects, chapters, notes, and pictures will be instantly populated back into the browser.
            </p>
            <div style="border: 2px dashed #CBD5E1; border-radius: var(--radius-md); padding: 24px; text-align: center; margin-bottom: 20px;">
              <input type="file" id="importBackupFileInput" accept=".json,.studyhub" style="display: none;" onchange="StudyApp.handleImportBackupFile(event)">
              <div style="font-weight: 700; color: var(--black-900); margin-bottom: 6px;">Select Backup JSON File</div>
              <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px;">Only files created with Study hub</div>
              <button class="btn btn-secondary btn-sm" onclick="document.getElementById('importBackupFileInput').click()">
                Select File
              </button>
            </div>
          </div>
          <div>
            <button class="btn btn-ghost btn-sm" style="color: var(--color-danger); width: 100%; justify-content: center;" onclick="StudyApp.confirmClearDatabase()">
              Reset & Clear All Data
            </button>
          </div>
        </div>
      </div>
    `;
  }

  async function handleExportBackup() {
    const btn = document.getElementById('exportBackupBtn');
    if (btn) {
      btn.disabled = true;
      btn.innerText = 'Creating Backup Package...';
    }

    try {
      const backupJson = await StudyHubDB.exportBackup();
      const blob = new Blob([backupJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `StudyHub_Backup_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast('Backup exported and downloaded successfully!', 'success');
    } catch (e) {
      showToast('Export failed: ' + e.message, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
          <span>Download Backup File (.json)</span>
        `;
      }
    }
  }

  async function handleImportBackupFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!confirm('Importing this backup will restore your subjects, chapters, and materials. Do you want to proceed?')) {
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        const res = await StudyHubDB.importBackup(text, true);
        showToast(`Restore completed! Restored ${res.subjectsCount} subjects, ${res.chaptersCount} chapters, ${res.filesCount} materials.`, 'success');
        await updateSidebarStats();
        navigateTo('dashboard');
      } catch (err) {
        showToast('Restore error: ' + err.message, 'error');
      }
    };
    reader.onerror = () => showToast('Failed to read file.', 'error');
    reader.readAsText(file);
    event.target.value = '';
  }

  function confirmClearDatabase() {
    openConfirmModal({
      title: 'Reset Study hub Database?',
      message: 'This will permanently delete all subjects, chapters, notes, images, and e-books stored in your browser. Make sure you exported a backup first!',
      actionLabel: 'Yes, Clear All Data',
      onConfirm: async () => {
        await StudyHubDB.clearAllData();
        showToast('All local data has been cleared.', 'success');
        await updateSidebarStats();
        navigateTo('dashboard');
      }
    });
  }

  // ==================== 8. FILE PREVIEWS (PDF & LIGHTBOX) ====================
  async function openFileById(fileId) {
    const file = await StudyHubDB.getFile(fileId);
    if (!file) {
      showToast('File not found', 'error');
      return;
    }

    // Add to recent
    await StudyHubDB.addRecentFile(file);

    if (file.category === 'images') {
      // Find all images in this chapter for gallery navigation
      const chapterImages = await StudyHubDB.getFilesByChapterAndCategory(file.chapterId, 'images');
      state.lightboxImages = chapterImages.length > 0 ? chapterImages : [file];
      const index = state.lightboxImages.findIndex(f => f.id === file.id);
      openImageLightbox(index >= 0 ? index : 0);
    } else {
      // PDF Preview
      previewPDF(file.id);
    }
  }

  async function previewPDF(fileId) {
    const file = await StudyHubDB.getFile(fileId);
    if (!file) {
      showToast('File not found', 'error');
      return;
    }

    await StudyHubDB.addRecentFile(file);

    let blob = file.blob;
    if (!blob && file.dataUrl) {
      blob = StudyHubDB.dataURLToBlob(file.dataUrl);
    }

    if (!blob) {
      showToast('Unable to open document data', 'error');
      return;
    }

    const objectUrl = URL.createObjectURL(blob);
    const modal = document.getElementById('pdfViewerModal');
    const iframe = document.getElementById('pdfViewerFrame');
    const titleEl = document.getElementById('pdfModalTitle');
    const openNewTabBtn = document.getElementById('pdfOpenNewTabBtn');
    const downloadBtn = document.getElementById('pdfDownloadBtn');

    titleEl.textContent = file.name;
    iframe.src = objectUrl;

    openNewTabBtn.onclick = () => window.open(objectUrl, '_blank');
    downloadBtn.onclick = () => downloadFile(file.id);

    modal.style.display = 'flex';
  }

  function openImageLightbox(index) {
    if (!state.lightboxImages || state.lightboxImages.length === 0) return;
    state.lightboxCurrentIndex = index;
    state.lightboxZoom = 1;

    renderLightboxCurrent();
    const modal = document.getElementById('imageLightboxModal');
    modal.style.display = 'flex';
  }

  function renderLightboxCurrent() {
    const imgFile = state.lightboxImages[state.lightboxCurrentIndex];
    if (!imgFile) return;

    // Track in recent
    StudyHubDB.addRecentFile(imgFile);

    const titleEl = document.getElementById('lightboxTitle');
    const counterEl = document.getElementById('lightboxCounter');
    const imgEl = document.getElementById('lightboxImage');
    const downloadBtn = document.getElementById('lightboxDownloadBtn');
    const prevBtn = document.getElementById('lightboxPrevBtn');
    const nextBtn = document.getElementById('lightboxNextBtn');

    titleEl.textContent = imgFile.name;
    counterEl.textContent = `${state.lightboxCurrentIndex + 1} / ${state.lightboxImages.length}`;

    let src = '';
    if (imgFile.blob) {
      src = URL.createObjectURL(imgFile.blob);
    } else if (imgFile.dataUrl) {
      src = imgFile.dataUrl;
    }

    imgEl.src = src;
    imgEl.style.transform = `scale(${state.lightboxZoom})`;

    downloadBtn.onclick = () => downloadFile(imgFile.id);

    // Hide or show nav buttons
    if (state.lightboxImages.length <= 1) {
      prevBtn.style.display = 'none';
      nextBtn.style.display = 'none';
    } else {
      prevBtn.style.display = 'flex';
      nextBtn.style.display = 'flex';
    }
  }

  function nextLightboxImage() {
    if (state.lightboxImages.length <= 1) return;
    state.lightboxCurrentIndex = (state.lightboxCurrentIndex + 1) % state.lightboxImages.length;
    state.lightboxZoom = 1;
    renderLightboxCurrent();
  }

  function prevLightboxImage() {
    if (state.lightboxImages.length <= 1) return;
    state.lightboxCurrentIndex = (state.lightboxCurrentIndex - 1 + state.lightboxImages.length) % state.lightboxImages.length;
    state.lightboxZoom = 1;
    renderLightboxCurrent();
  }

  function setLightboxZoom(level) {
    const clamped = Math.min(Math.max(level, 0.5), 3);
    state.lightboxZoom = clamped;
    const imgEl = document.getElementById('lightboxImage');
    const zoomResetBtn = document.getElementById('lightboxZoomReset');
    if (imgEl) imgEl.style.transform = `scale(${clamped})`;
    if (zoomResetBtn) zoomResetBtn.textContent = `${Math.round(clamped * 100)}%`;
  }

  async function downloadFile(fileId) {
    const file = await StudyHubDB.getFile(fileId);
    if (!file) return;

    let blob = file.blob;
    if (!blob && file.dataUrl) {
      blob = StudyHubDB.dataURLToBlob(file.dataUrl);
    }

    if (!blob) {
      showToast('Could not download file', 'error');
      return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Downloading "${file.name}"`, 'success');
  }

  // ==================== 9. SUBJECT MODAL (ADD / EDIT) ====================
  function initColorPicker() {
    const picker = document.getElementById('subjectColorPicker');
    const input = document.getElementById('subjectColorInput');
    if (!picker || !input) return;

    picker.innerHTML = SUBJECT_COLORS.map((c, i) => `
      <div class="color-option ${i === 0 ? 'selected' : ''}" data-color="${c}" style="background-color: ${c};" onclick="StudyApp.selectSubjectColor('${c}', this)"></div>
    `).join('');
  }

  function selectSubjectColor(color, el) {
    const input = document.getElementById('subjectColorInput');
    if (input) input.value = color;

    document.querySelectorAll('#subjectColorPicker .color-option').forEach(opt => {
      if (el && opt === el) {
        opt.classList.add('selected');
      } else if (!el && opt.getAttribute('data-color') === color) {
        opt.classList.add('selected');
      } else {
        opt.classList.remove('selected');
      }
    });
  }

  function openAddSubjectModal() {
    document.getElementById('subjectModalTitle').textContent = 'Add New Subject';
    document.getElementById('subjectFormId').value = '';
    document.getElementById('subjectNameInput').value = '';
    document.getElementById('subjectDescInput').value = '';
    selectSubjectColor(SUBJECT_COLORS[0], document.querySelector('#subjectColorPicker .color-option'));
    document.getElementById('subjectSubmitBtn').textContent = 'Add Subject';

    openModal('subjectModal');
  }

  async function openEditSubjectModal(subjectId) {
    const sub = await StudyHubDB.getSubject(subjectId);
    if (!sub) return;

    document.getElementById('subjectModalTitle').textContent = `Edit Subject: ${sub.name}`;
    document.getElementById('subjectFormId').value = sub.id;
    document.getElementById('subjectNameInput').value = sub.name;
    document.getElementById('subjectDescInput').value = sub.description || '';

    // Color
    const color = sub.color || SUBJECT_COLORS[0];
    selectSubjectColor(color, null);

    document.getElementById('subjectSubmitBtn').textContent = 'Update Subject';
    openModal('subjectModal');
  }

  async function handleSubjectSubmit(event) {
    event.preventDefault();
    const id = document.getElementById('subjectFormId').value;
    const name = document.getElementById('subjectNameInput').value.trim();
    const color = document.getElementById('subjectColorInput').value;
    const description = document.getElementById('subjectDescInput').value.trim();

    if (!name) return;

    if (id) {
      await StudyHubDB.updateSubject({ id, name, color, description });
      showToast(`Subject "${name}" updated`, 'success');
    } else {
      await StudyHubDB.addSubject({ name, color, description });
      showToast(`Subject "${name}" added`, 'success');
    }

    closeModal('subjectModal');
    await refreshCurrentView();
    await updateSidebarStats();
  }

  function confirmDeleteSubject(subjectId, subjectName) {
    openConfirmModal({
      title: `Delete "${subjectName}"?`,
      message: `Deleting this subject will also delete all of its chapters and associated study materials (PDFs and Images). This action cannot be reversed.`,
      actionLabel: 'Yes, Delete Subject',
      onConfirm: async () => {
        await StudyHubDB.deleteSubject(subjectId);
        showToast(`Subject "${subjectName}" deleted`, 'success');
        await refreshCurrentView();
        await updateSidebarStats();
      }
    });
  }

  // ==================== 10. CHAPTER MODAL (ADD / EDIT) ====================
  function openAddChapterModal(subjectId) {
    document.getElementById('chapterModalTitle').textContent = 'Add New Chapter';
    document.getElementById('chapterFormId').value = '';
    document.getElementById('chapterFormSubjectId').value = subjectId;
    document.getElementById('chapterTitleInput').value = '';
    document.getElementById('chapterDescInput').value = '';

    // Auto calculate next chapter number
    StudyHubDB.getChaptersBySubject(subjectId).then(chapters => {
      const nextNum = chapters.length + 1;
      document.getElementById('chapterNumberInput').value = nextNum;
    });

    document.getElementById('chapterSubmitBtn').textContent = 'Save Chapter';
    openModal('chapterModal');
  }

  async function openEditChapterModal(chapterId) {
    const chap = await StudyHubDB.getChapter(chapterId);
    if (!chap) return;

    document.getElementById('chapterModalTitle').textContent = `Edit Chapter ${chap.chapterNumber}`;
    document.getElementById('chapterFormId').value = chap.id;
    document.getElementById('chapterFormSubjectId').value = chap.subjectId;
    document.getElementById('chapterNumberInput').value = chap.chapterNumber;
    document.getElementById('chapterTitleInput').value = chap.title;
    document.getElementById('chapterDescInput').value = chap.description || '';

    document.getElementById('chapterSubmitBtn').textContent = 'Update Chapter';
    openModal('chapterModal');
  }

  async function handleChapterSubmit(event) {
    event.preventDefault();
    const id = document.getElementById('chapterFormId').value;
    const subjectId = document.getElementById('chapterFormSubjectId').value;
    const chapterNumber = document.getElementById('chapterNumberInput').value;
    const title = document.getElementById('chapterTitleInput').value.trim();
    const description = document.getElementById('chapterDescInput').value.trim();

    if (!title) return;

    if (id) {
      await StudyHubDB.updateChapter({ id, subjectId, chapterNumber, title, description });
      showToast(`Chapter ${chapterNumber} updated`, 'success');
    } else {
      await StudyHubDB.addChapter({ subjectId, chapterNumber, title, description });
      showToast(`Chapter ${chapterNumber}: "${title}" created`, 'success');
    }

    closeModal('chapterModal');
    await refreshCurrentView();
    await updateSidebarStats();
  }

  function confirmDeleteChapter(chapterId, chapterLabel) {
    openConfirmModal({
      title: `Delete "${chapterLabel}"?`,
      message: `Deleting this chapter will remove all uploaded notes, image diagrams, and e-books under it. This cannot be undone.`,
      actionLabel: 'Yes, Delete Chapter',
      onConfirm: async () => {
        await StudyHubDB.deleteChapter(chapterId);
        showToast(`Chapter deleted`, 'success');
        await refreshCurrentView();
        await updateSidebarStats();
      }
    });
  }

  // ==================== 11. FILE RENAME & DELETE ====================
  function openRenameFileModal(fileId, currentName) {
    document.getElementById('renameFileId').value = fileId;
    document.getElementById('renameFileInput').value = currentName;
    openModal('renameFileModal');
  }

  async function handleRenameFileSubmit(event) {
    event.preventDefault();
    const id = document.getElementById('renameFileId').value;
    const newName = document.getElementById('renameFileInput').value.trim();

    if (!newName) return;

    await StudyHubDB.updateFileName(id, newName);
    showToast('File renamed successfully', 'success');
    closeModal('renameFileModal');
    await refreshCurrentView();
  }

  function confirmDeleteFile(fileId, fileName) {
    openConfirmModal({
      title: `Delete File?`,
      message: `Are you sure you want to delete "${fileName}"? This file will be permanently removed from your local storage.`,
      actionLabel: 'Delete File',
      onConfirm: async () => {
        await StudyHubDB.deleteFile(fileId);
        showToast(`"${fileName}" deleted`, 'success');
        await refreshCurrentView();
        await updateSidebarStats();
      }
    });
  }

  // ==================== 12. SIDEBAR RENDERING & STATS ====================
  async function renderSidebarSubjects() {
    const listEl = document.getElementById('sidebarSubjectsList');
    if (!listEl) return;

    const subjects = await StudyHubDB.getAllSubjects();

    if (subjects.length === 0) {
      listEl.innerHTML = `
        <div style="font-size: 0.78rem; color: var(--black-400); padding: 8px 10px; font-style: italic;">
          No subjects yet.<br>Click + to create one.
        </div>
      `;
      return;
    }

    // Get chapter counts for each
    const itemPromises = subjects.map(async (sub) => {
      const chapters = await StudyHubDB.getChaptersBySubject(sub.id);
      return {
        ...sub,
        chapterCount: chapters.length
      };
    });

    const items = await Promise.all(itemPromises);

    listEl.innerHTML = items.map(sub => {
      const isActive = state.currentRoute === 'subject' && state.routeParams.subjectId === sub.id;
      return `
        <a href="#/subject/${sub.id}" class="sidebar-subject-link ${isActive ? 'active' : ''}" data-subject-id="${sub.id}" title="${escapeHtml(sub.name)}">
          <span style="display: flex; align-items: center; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            <span class="sidebar-sub-color" style="background-color: ${sub.color || '#FFD000'};"></span>
            <span class="sidebar-sub-name">${escapeHtml(sub.name)}</span>
          </span>
          <span class="sidebar-subject-badge">${sub.chapterCount}</span>
        </a>
      `;
    }).join('');

    updateActiveNavLinks();
  }

  async function updateSidebarStats() {
    const stats = await StudyHubDB.getAppStats();
    const recent = await StudyHubDB.getRecentFiles(100);

    // Sidebar recent count badge
    const badge = document.getElementById('sidebarRecentCount');
    if (badge) badge.textContent = recent.length;

    // Sidebar storage size & bar
    const sizeEl = document.getElementById('sidebarStorageSize');
    const barEl = document.getElementById('sidebarStorageBar');

    if (sizeEl) sizeEl.textContent = formatBytes(stats.totalBytes);

    if (barEl) {
      // Rough meter: assume standard browser 50MB quota preview
      const maxApproxBytes = 50 * 1024 * 1024;
      const pct = Math.min(Math.max((stats.totalBytes / maxApproxBytes) * 100, 4), 100);
      barEl.style.width = `${pct}%`;
    }

    // Refresh subjects list in sidebar
    await renderSidebarSubjects();
  }

  // ==================== CONFIRM MODAL HELPERS ====================
  function openConfirmModal({ title, message, actionLabel = 'Delete', onConfirm }) {
    document.getElementById('confirmModalTitle').textContent = title;
    document.getElementById('confirmModalMessage').textContent = message;

    const actionBtn = document.getElementById('confirmModalActionBtn');
    actionBtn.textContent = actionLabel;
    actionBtn.onclick = async () => {
      closeModal('confirmModal');
      if (typeof onConfirm === 'function') {
        await onConfirm();
      }
    };

    openModal('confirmModal');
  }

  // ==================== MODAL HELPERS ====================
  function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'flex';
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
      modal.style.display = 'none';

      // Clean up PDF iframe src if closing pdf viewer
      if (id === 'pdfViewerModal') {
        const iframe = document.getElementById('pdfViewerFrame');
        if (iframe) iframe.src = '';
      }
    }
  }

  function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.style.display = 'none';
    });
    const iframe = document.getElementById('pdfViewerFrame');
    if (iframe) iframe.src = '';
  }

  function isModalOpen(id) {
    const el = document.getElementById(id);
    return el && el.style.display !== 'none';
  }

  // ==================== TOAST SYSTEM ====================
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else if (type === 'error') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    } else {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFD000" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    }

    toast.innerHTML = `${iconSvg}<span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 250);
    }, 3500);
  }

  // ==================== FORMATTERS & UTILITIES ====================
  function formatBytes(bytes, decimals = 1) {
    if (!bytes || bytes === 0) return '0 KB';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  function formatTimeAgo(timestamp) {
    if (!timestamp) return '';
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function getFileBadgeClass(category) {
    if (category === 'notes') return 'pdf-badge';
    if (category === 'images') return 'img-badge';
    if (category === 'ebook') return 'ebook-badge';
    return 'pdf-badge';
  }

  function getFileCategoryLabel(category) {
    if (category === 'notes') return 'PDF Note';
    if (category === 'images') return 'Image';
    if (category === 'ebook') return 'E-Book';
    return 'Document';
  }

  function getStageName(classNum) {
    if (classNum <= 5) return 'Primary';
    if (classNum <= 8) return 'Middle';
    if (classNum === 10) return 'Board';
    if (classNum <= 10) return 'Secondary';
    if (classNum === 12) return 'Senior Board';
    return 'Sr Secondary';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgb(${r}, ${g}, ${b})`;
  }

  // Public Interface
  return {
    init,
    navigateTo,
    switchMaterialTab,
    // Modals
    openModal,
    closeModal,
    openAddSubjectModal,
    openEditSubjectModal,
    handleSubjectSubmit,
    confirmDeleteSubject,
    selectSubjectColor,
    openAddChapterModal,
    openEditChapterModal,
    handleChapterSubmit,
    confirmDeleteChapter,
    openRenameFileModal,
    handleRenameFileSubmit,
    confirmDeleteFile,
    // Files & Previews
    previewPDF,
    openImageLightbox,
    openFileById,
    openFileFromDropdown,
    downloadFile,
    // Backup
    handleExportBackup,
    handleImportBackupFile,
    confirmClearDatabase,
    showToast
  };
})();

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  StudyApp.init();
});
