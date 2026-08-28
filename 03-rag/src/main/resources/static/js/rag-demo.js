// RAG Demo JavaScript

// DOM Elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const uploadStatus = document.getElementById('uploadStatus');
const uploadProgress = document.getElementById('uploadProgress');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const questionInput = document.getElementById('questionInput');
const askButton = document.getElementById('askButton');
const queryStatus = document.getElementById('queryStatus');
const answerSection = document.getElementById('answerSection');
const answerText = document.getElementById('answerText');
const sourcesSection = document.getElementById('sourcesSection');
const sourcesList = document.getElementById('sourcesList');

let documentUploaded = false;

// Upload Area Click Handler
uploadArea.addEventListener('click', () => {
    fileInput.click();
});

// Drag and Drop Handlers
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragging');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragging');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragging');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFileUpload(files[0]);
    }
});

// File Input Change Handler
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        handleFileUpload(file);
    }
});

// Ask Button Handler
askButton.addEventListener('click', async () => {
    const question = questionInput.value.trim();
    
    if (!question) {
        showStatus(queryStatus, 'Please enter a question', 'error');
        return;
    }

    await askQuestion(question);
});

// Enter key to ask question
questionInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !askButton.disabled) {
        e.preventDefault();
        askButton.click();
    }
});

// Handle File Upload
async function handleFileUpload(file) {
    // Validate file type
    const validTypes = ['application/pdf', 'text/plain'];
    if (!validTypes.includes(file.type)) {
        showStatus(uploadStatus, 'Please upload a PDF or TXT file', 'error');
        return;
    }

    // Validate file size (10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
        showStatus(uploadStatus, 'File size must be less than 10MB', 'error');
        return;
    }

    // Show progress
    hideStatus(uploadStatus);
    showProgress(0, 'Uploading...');

    try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/documents/upload', {
            method: 'POST',
            body: formData
        });

        showProgress(50, 'Processing document...');

        const result = await response.json();

        if (response.ok) {
            showProgress(100, 'Complete!');
            setTimeout(() => {
                hideProgress();
                showStatus(uploadStatus, 
                    `✓ Successfully processed "${file.name}" (${result.segmentCount} segments created)`, 
                    'success');
                documentUploaded = true;
                askButton.disabled = false;
            }, 500);
        } else {
            hideProgress();
            showStatus(uploadStatus, 
                `Failed to process document: ${result.message || 'Unknown error'}`, 
                'error');
        }
    } catch (error) {
        hideProgress();
        showStatus(uploadStatus, 
            `Upload failed: ${error.message}`, 
            'error');
    }
}

// Ask Question
async function askQuestion(question) {
    // Disable button and show loading
    askButton.disabled = true;
    askButton.innerHTML = '<span class="btn-icon">⏳</span> Searching...';
    hideStatus(queryStatus);
    answerSection.style.display = 'none';

    try {
        const response = await fetch('/api/rag/advisor/ask', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ question: question })
        });

        const result = await response.json();

        if (response.ok) {
            displayAnswer(result);
        } else {
            showStatus(queryStatus, 
                `Failed to get answer: ${result.message || 'Unknown error'}`, 
                'error');
        }
    } catch (error) {
        showStatus(queryStatus, 
            `Request failed: ${error.message}`, 
            'error');
    } finally {
        askButton.disabled = false;
        askButton.innerHTML = '<span class="btn-icon">🔍</span> Ask Question';
    }
}

// Display Answer
function displayAnswer(result) {
    answerSection.style.display = 'block';
    answerText.classList.add('markdown-body');
    answerText.innerHTML = renderMarkdown(result.answer);

    if (result.sources && result.sources.length > 0) {
        sourcesSection.style.display = 'block';
        // filename and excerpt are attacker-controlled (upload name / document body) — never interpolate raw.
        sourcesList.innerHTML = result.sources.map((source, index) => `
            <div class="source-item">
                <p><strong>Source ${index + 1}: ${escapeHtml(source.filename)}</strong></p>
                <p class="source-content">"${escapeHtml(source.excerpt)}"</p>
                <p class="source-meta">Relevance: ${(source.relevanceScore * 100).toFixed(1)}%</p>
            </div>
        `).join('');
    } else {
        sourcesSection.style.display = 'none';
    }

    // Scroll to answer
    answerSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
}

// Show Status Message
function showStatus(element, message, type) {
    element.textContent = message;
    element.className = `status-message ${type}`;
    element.style.display = 'block';
}

// Hide Status Message
function hideStatus(element) {
    element.style.display = 'none';
}

// Show Progress
function showProgress(percent, message) {
    uploadProgress.style.display = 'block';
    progressFill.style.width = `${percent}%`;
    progressText.textContent = message;
}

// Hide Progress
function hideProgress() {
    uploadProgress.style.display = 'none';
}
