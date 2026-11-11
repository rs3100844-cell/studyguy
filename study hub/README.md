# Study hub — Modern Study Material Organiser

**Study hub** is a modern, responsive, client-side web application designed for students and educators to organize, preview, and manage curriculum materials across all subjects.

Built with a high-contrast **Bright Yellow & Deep Black** design system, off-white background, rounded surfaces, smooth micro-interactions, and local **IndexedDB** persistence.

---

## 🌟 Key Features

### 1. Dashboard & Navigation
* **Subjects Directory:** Attractive interactive cards for all your subjects with metrics showing total chapters and study files.
* **Live Global Search:** Instant search bar (press `/` anywhere) to search across all subjects, chapters, notes, and e-books with a live dropdown preview.
* **Recently Opened Materials:** Displays your most recently viewed notes, e-books, and images with 1-click preview and time-ago indicators.
* **Real-time Metrics:** Stats banner displaying total subjects, chapters, saved study materials, and storage size stored locally.
* **Collapsible Responsive Sidebar:** Fast navigation between the Dashboard, Subject shortcuts, Recently Opened, and Backup tools.

### 2. Hierarchical Organisation Structure
Organises educational content in a clean 3-level hierarchy:
```text
Subject ➔ Chapter ➔ Study Materials
```
* **Subjects Management:** Add, edit, and delete subjects with custom color tags and descriptions.
* **Chapters Management:** Add, edit, and delete numbered chapters with key topics and summaries.
* **Breadcrumb Navigation:** Seamless path tracking (`Dashboard > Mathematics > Chapter 1: Real Numbers`).

### 3. Study Materials (3 Dedicated Sections per Chapter)
Every chapter provides three specialized study material sections:
1. **📝 Notes:** Upload multiple PDF revision notes, formula sheets, and summaries.
2. **🖼️ Image Notes:** Upload multiple image diagrams (JPG, PNG, WEBP) into a responsive gallery.
3. **📖 Chapter E-book:** Upload full textbook chapter PDFs or reference books.

**File Capabilities:**
* **Multiple File Uploads:** Drag-and-drop or file selector support for multiple simultaneous uploads.
* **In-App PDF Previewer:** Built-in fullscreen modal viewer with "New Tab" and "Download" buttons.
* **Interactive Image Lightbox:** Fullscreen gallery viewer with Zoom In, Zoom Out, 100% Reset, Previous/Next navigation, and download.
* **File Management:** Rename display titles, download files, and delete items with confirmation dialogs.

### 4. Zero Backend / Pure Client-Side Storage
* Uses **IndexedDB** for storing binary files (`Blob` / `File`) and metadata locally in the user's browser.
* **No registration, no login, no server required.**
* **Persistent:** Data remains saved after refreshing or restarting the browser.
* **Backup & Restore:**
  * **Export Backup:** One-click download of all subjects, chapters, and file contents as a structured JSON backup.
  * **Import Backup:** Restore data anytime onto another machine or after clearing browser history.
  * **Demo Pack:** Includes a built-in sample starter pack (Mathematics, Science, Physics, Computer Science with sample notes, diagrams, and e-book) for immediate testing.

---

## 🚀 How to Run

Simply open `index.html` in any modern web browser:
* Double-click `index.html`, or
* Drag and drop `index.html` into Google Chrome, Microsoft Edge, Mozilla Firefox, Brave, or Safari.

No Node.js or web server is strictly needed, although any local static server can also be used:
```bash
# Optional: using any static file server if desired
npx serve .
# or
python -m http.server 8080
```

---

## 🎨 Theme & Design Specs

* **Bright Yellow:** `#FFD000` / `#FFE600`
* **Deep Black:** `#0B0B0E` / `#121318` / `#181920`
* **Off-White Surface:** `#F6F7F9` / `#FAFBFD`
* **Typography:** Plus Jakarta Sans & JetBrains Mono

---

## ⌨️ Keyboard Shortcuts
* `/`: Focus global search input
* `Esc`: Close any open modal, PDF viewer, or image lightbox
* `←` / `→`: Navigate previous/next image when viewing image notes in the lightbox
