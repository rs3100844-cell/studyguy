/**
 * Study hub — Sample Demo Starter Pack Generator
 * Creates valid sample PDFs and educational diagrams so users can explore
 * previewing, gallery viewing, downloading, and searching immediately!
 */

const SampleDataGenerator = (function() {

  /**
   * Generates a valid standard PDF 1.4 binary Blob with custom title, subtitle, and bullet points.
   */
  function createSamplePDFBlob(title, subtitle, contentLines = []) {
    // Sanitize string for PDF string literal
    const clean = (str) => (str || '').replace(/[()\\\/]/g, ' ');

    let streamText = `BT\n/F1 22 Tf\n50 720 Td\n(${clean(title)}) Tj\n`;
    streamText += `/F2 12 Tf\n0 -26 Td\n(${clean(subtitle)}) Tj\n`;
    streamText += `0 -20 Td\n(Study hub Verified Study Note  |  Generated on ${new Date().toLocaleDateString()}) Tj\n`;
    streamText += `0 -30 Td\n`;

    contentLines.forEach((line) => {
      streamText += `/F1 12 Tf\n(${clean(line.heading || '')}) Tj\n`;
      streamText += `/F2 10 Tf\n0 -16 Td\n(${clean(line.text || '')}) Tj\n`;
      streamText += `0 -22 Td\n`;
    });

    streamText += `ET\n`;

    const streamLength = streamText.length;

    const pdfParts = [
      `%PDF-1.4\n`,
      `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`,
      `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`,
      `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n`,
      `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamText}\nendstream\nendobj\n`,
      `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`,
      `6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`
    ];

    let fullPdf = pdfParts.join('');
    const xrefOffset = fullPdf.length;

    const xref = [
      `xref\n`,
      `0 7\n`,
      `0000000000 65535 f \n`,
      `0000000009 00000 n \n`,
      `0000000058 00000 n \n`,
      `0000000115 00000 n \n`,
      `0000000244 00000 n \n`,
      `0000000300 00000 n \n`,
      `0000000370 00000 n \n`,
      `trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
    ].join('');

    fullPdf += xref;
    return new Blob([fullPdf], { type: 'application/pdf' });
  }

  /**
   * Generates a canvas-rendered crisp educational diagram image blob (PNG)
   */
  function createSampleImageBlob(title, subtitle, type = 'math') {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 600;
    const ctx = canvas.getContext('2d');

    // Safe roundRect helper
    function drawRoundedRect(x, y, w, h, r) {
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, w, h, r);
      } else {
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
      }
    }

    // Background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 900, 600);
    bgGrad.addColorStop(0, '#121318');
    bgGrad.addColorStop(1, '#1A1C24');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 900, 600);

    // Border
    ctx.strokeStyle = '#FFD000';
    ctx.lineWidth = 4;
    ctx.strokeRect(16, 16, 868, 568);

    // Header badge
    ctx.fillStyle = '#FFD000';
    ctx.beginPath();
    drawRoundedRect(40, 40, 160, 36, 18);
    ctx.fill();

    ctx.fillStyle = '#0B0B0E';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('STUDY HUB NOTE', 55, 63);

    // Title & Subtitle
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 32px sans-serif';
    ctx.fillText(title, 40, 125);

    ctx.fillStyle = '#9CA3AF';
    ctx.font = '18px sans-serif';
    ctx.fillText(subtitle, 40, 155);

    // Diagram drawing based on type
    if (type === 'math') {
      // Right Triangle diagram
      ctx.fillStyle = '#20222B';
      ctx.beginPath();
      drawRoundedRect(40, 190, 820, 350, 12);
      ctx.fill();

      // Triangle
      ctx.strokeStyle = '#FFD000';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(150, 480);
      ctx.lineTo(450, 480);
      ctx.lineTo(150, 260);
      ctx.closePath();
      ctx.stroke();

      // Right angle marker
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.strokeRect(150, 455, 25, 25);

      // Labels
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('Base (b)', 270, 510);
      ctx.fillText('Perpendicular (a)', 60, 380);
      ctx.fillStyle = '#FFD000';
      ctx.fillText('Hypotenuse (c)', 320, 350);

      // Formula card
      ctx.fillStyle = '#121318';
      ctx.beginPath();
      drawRoundedRect(520, 240, 310, 240, 12);
      ctx.fill();
      ctx.strokeStyle = '#FFD000';
      ctx.strokeRect(520, 240, 310, 240);

      ctx.fillStyle = '#FFD000';
      ctx.font = 'bold 24px monospace';
      ctx.fillText('c² = a² + b²', 550, 310);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '16px sans-serif';
      ctx.fillText('• Pythagoras Theorem', 550, 360);
      ctx.fillText('• Valid for right-angled triangles', 550, 395);
      ctx.fillText('• Fundamental Geometry Concept', 550, 430);
    } else {
      // Science / Biology diagram
      ctx.fillStyle = '#20222B';
      ctx.beginPath();
      drawRoundedRect(40, 190, 820, 350, 12);
      ctx.fill();

      // Process boxes
      const boxes = [
        { label: 'Sunlight + CO2 + H2O', x: 70, y: 310, color: '#38BDF8' },
        { label: 'Chloroplast (Leaf)', x: 340, y: 310, color: '#4ADE80' },
        { label: 'Glucose + Oxygen (O2)', x: 600, y: 310, color: '#FFD000' }
      ];

      boxes.forEach((b, idx) => {
        ctx.fillStyle = '#121318';
        ctx.beginPath();
        drawRoundedRect(b.x, b.y, 200, 90, 10);
        ctx.fill();
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 3;
        ctx.strokeRect(b.x, b.y, 200, 90);

        ctx.fillStyle = b.color;
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(b.label, b.x + 12, b.y + 50);

        if (idx < 2) {
          // Arrow
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(b.x + 205, b.y + 45);
          ctx.lineTo(b.x + 255, b.y + 45);
          ctx.stroke();
          // Arrowhead
          ctx.beginPath();
          ctx.moveTo(b.x + 245, b.y + 35);
          ctx.lineTo(b.x + 260, b.y + 45);
          ctx.lineTo(b.x + 245, b.y + 55);
          ctx.stroke();
        }
      });

      // Equation
      ctx.fillStyle = '#FFD000';
      ctx.font = 'bold 22px monospace';
      ctx.fillText('6CO2 + 6H2O + Light  ──>  C6H12O6 + 6O2', 170, 470);
    }

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
  }

  /**
   * Seeds demo data into IndexedDB
   */
  async function loadDemoStarterPack() {
    // 1. Subjects
    const mathSub = await StudyHubDB.addSubject({
      name: 'Mathematics',
      color: '#FFD000',
      description: 'Standard & Advanced Mathematics, algebra, calculus, and formula sheets'
    });

    const sciSub = await StudyHubDB.addSubject({
      name: 'Science',
      color: '#38BDF8',
      description: 'Physics, Chemistry & Biology modules and experiment notes'
    });

    const physSub = await StudyHubDB.addSubject({
      name: 'Physics',
      color: '#A855F7',
      description: 'Senior Secondary Physics Core Syllabus & practical guides'
    });

    const csSub = await StudyHubDB.addSubject({
      name: 'Computer Science',
      color: '#4ADE80',
      description: 'Programming, Data Structures, Algorithms & Web Development'
    });

    // 2. Chapters
    const chap1 = await StudyHubDB.addChapter({
      subjectId: mathSub.id,
      chapterNumber: 1,
      title: 'Real Numbers',
      description: 'Fundamental Theorem of Arithmetic, Euclid division lemma, irrational proofs'
    });

    const chap2 = await StudyHubDB.addChapter({
      subjectId: mathSub.id,
      chapterNumber: 2,
      title: 'Polynomials',
      description: 'Geometrical meaning of zeroes, relationship between zeroes & coefficients'
    });

    const sciChap1 = await StudyHubDB.addChapter({
      subjectId: sciSub.id,
      chapterNumber: 1,
      title: 'Life Processes',
      description: 'Nutrition, Respiration, Transportation and Excretion in plants & humans'
    });

    const physChap1 = await StudyHubDB.addChapter({
      subjectId: physSub.id,
      chapterNumber: 1,
      title: 'Electric Charges and Fields',
      description: 'Coulombs law, electric flux, Gauss theorem and applications'
    });

    // 3. Create sample study files for Mathematics > Real Numbers
    // A. Notes PDF
    const notePdf1 = createSamplePDFBlob(
      'Real Numbers — Quick Revision Summary',
      'Mathematics | Chapter 1 Revision Notes',
      [
        { heading: '1. Fundamental Theorem of Arithmetic', text: 'Every composite number can be expressed as a product of primes uniquely.' },
        { heading: '2. HCF and LCM Property', text: 'For any two positive integers a and b: HCF(a, b) * LCM(a, b) = a * b.' },
        { heading: '3. Revisit to Irrational Numbers', text: 'Proof by contradiction: sqrt(2), sqrt(3), sqrt(5) are irrational.' }
      ]
    );

    await StudyHubDB.addFile({
      subjectId: mathSub.id,
      chapterId: chap1.id,
      category: 'notes',
      name: 'Real_Numbers_Revision_Notes.pdf',
      type: 'application/pdf',
      size: notePdf1.size,
      blob: notePdf1
    });

    // B. Image Note
    const mathDiagramBlob = await createSampleImageBlob(
      'Pythagoras Theorem & Properties',
      'Fundamental right-angled triangle formula sheet',
      'math'
    );

    await StudyHubDB.addFile({
      subjectId: mathSub.id,
      chapterId: chap1.id,
      category: 'images',
      name: 'Right_Triangle_Pythagoras_Diagram.png',
      type: 'image/png',
      size: mathDiagramBlob.size,
      blob: mathDiagramBlob
    });

    // C. Chapter E-Book PDF
    const ebookPdf = createSamplePDFBlob(
      'Mathematics — Chapter 1 Complete Text',
      'Complete Chapter Reference Text & Exercise Questions',
      [
        { heading: 'Section 1.1: Introduction', text: 'Exploration of real numbers and positive integer properties.' },
        { heading: 'Section 1.2: Euclid Division Algorithm', text: 'Used for computing Highest Common Factor (HCF) of two positive integers.' },
        { heading: 'Exercise 1.1 & 1.2 Solutions', text: 'Step by step problem solving techniques for exam preparation.' }
      ]
    );

    const ebookRecord = await StudyHubDB.addFile({
      subjectId: mathSub.id,
      chapterId: chap1.id,
      category: 'ebook',
      name: 'Chapter_01_Complete_Ebook.pdf',
      type: 'application/pdf',
      size: ebookPdf.size,
      blob: ebookPdf
    });

    // Track as recently opened
    await StudyHubDB.addRecentFile(ebookRecord);

    // 4. Create sample file for Science > Life Processes
    const bioDiagramBlob = await createSampleImageBlob(
      'Photosynthesis Process Flowchart',
      'Light reaction, chloroplast conversion, and glucose generation',
      'bio'
    );

    await StudyHubDB.addFile({
      subjectId: sciSub.id,
      chapterId: sciChap1.id,
      category: 'images',
      name: 'Photosynthesis_Mechanism_Flowchart.png',
      type: 'image/png',
      size: bioDiagramBlob.size,
      blob: bioDiagramBlob
    });

    return true;
  }

  return {
    createSamplePDFBlob,
    createSampleImageBlob,
    loadDemoStarterPack
  };
})();
