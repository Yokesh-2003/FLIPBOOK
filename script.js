/* ==========================================================================
   GLOBAL STATE & AUDIO CONTROLLER
   ========================================================================== */
let pageFlipInstance = null;
let soundEnabled = true;
let zoomScale = 1.0;
let imageWidth = 0;
let imageHeight = 0;
let isDragging = false;
let startX, startY, scrollLeft, scrollTop;

// Preload user's custom page turn sound effect (page.mp3)
const pageFlipAudio = new Audio("page.mp3");
pageFlipAudio.preload = "auto";

// Check if audio fails to load
let useSynthesizedAudio = false;
pageFlipAudio.addEventListener('error', () => {
    console.warn("Local sound file failed to load, falling back to synthesized Web Audio API.");
    useSynthesizedAudio = true;
});

/**
 * Triggers the page turning sound effect
 */
function playPageTurnSound() {
    if (!soundEnabled) return;
    
    if (!useSynthesizedAudio) {
        pageFlipAudio.currentTime = 0;
        pageFlipAudio.play().catch(err => {
            console.warn("Audio play failed, using Web Audio synthesizer fallback:", err);
            synthesizePageFlipSound();
        });
    } else {
        synthesizePageFlipSound();
    }
}

/**
 * Fallback Web Audio API synthesizer for realistic page rustling/whoosh sound
 */
function synthesizePageFlipSound() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        
        const duration = 0.35; // duration in seconds
        const bufferSize = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        
        // Fill buffer with white noise
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        
        // Lowpass filter for paper sweep effect
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.value = 1.2;
        
        // Volume Gain Node
        const gain = ctx.createGain();
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        
        const now = ctx.currentTime;
        
        // Frequency sweep from 1500Hz to 300Hz (simulating paper curl and release)
        filter.frequency.setValueAtTime(1500, now);
        filter.frequency.exponentialRampToValueAtTime(300, now + duration);
        
        // Volume envelope (fade in fast, fade out)
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.12, now + 0.05); // volume peak
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        
        noise.start(now);
        noise.stop(now + duration);
    } catch (e) {
        console.error("Synthesizer audio failed:", e);
    }
}

/* ==========================================================================
   IMAGE PRELOADER & INITIALIZATION
   ========================================================================== */
document.addEventListener("DOMContentLoaded", () => {
    // Check local storage for sound settings preference
    const storedSound = localStorage.getItem('soundEnabled');
    if (storedSound !== null) {
        soundEnabled = storedSound === 'true';
        updateSoundButtonUI();
    }

    const imagesToLoad = ['1.png', '2.png', '3.png', '4.png'];
    let loadedCount = 0;
    
    // First load image 1 to extract resolution
    const firstImg = new Image();
    firstImg.src = imagesToLoad[0];
    firstImg.onload = () => {
        imageWidth = firstImg.naturalWidth;
        imageHeight = firstImg.naturalHeight;
        
        // Proceed to load other images
        loadRemainingImages();
    };
    
    firstImg.onerror = () => {
        console.error("Failed to load cover image. Falling back to default dimensions.");
        imageWidth = 1000;  // Portrait page width
        imageHeight = 1400; // Portrait page height
        loadRemainingImages();
    };

    function loadRemainingImages() {
        imagesToLoad.forEach((src, idx) => {
            if (idx === 0) {
                loadedCount++;
                checkAllLoaded();
                return;
            }
            const img = new Image();
            img.src = src;
            img.onload = () => {
                loadedCount++;
                checkAllLoaded();
            };
            img.onerror = () => {
                console.error(`Failed to load page image: ${src}`);
                loadedCount++;
                checkAllLoaded();
            };
        });
    }

    function checkAllLoaded() {
        if (loadedCount === imagesToLoad.length) {
            // Hide Loader & initialize flipbook
            const loader = document.getElementById('loader');
            if (loader) {
                loader.classList.add('fade-out');
                setTimeout(() => {
                    initializeBook();
                    setupControls();
                }, 500);
            } else {
                initializeBook();
                setupControls();
            }
        }
    }
});

/* ==========================================================================
   ST.PAGEFLIP INITIALIZATION & RESPONSIVENESS
   ========================================================================== */
function calculateBookSize() {
    const viewport = document.getElementById('zoom-viewport');
    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;
    
    const singleAspectRatio = imageWidth / imageHeight;
    
    // Check if the screen width/height is in landscape and wide enough for two-page spread
    const isLandscape = viewportWidth >= 768 && (viewportWidth > viewportHeight);
    const targetRatio = isLandscape ? (singleAspectRatio * 2) : singleAspectRatio;
    
    // Leave safe paddings (moderate margin to reduce size slightly)
    const marginHorizontal = isLandscape ? 80 : 24;
    const marginVertical = 50;
    
    const maxWidth = viewportWidth - marginHorizontal;
    const maxHeight = viewportHeight - marginVertical;
    
    let width, height;
    
    if (maxWidth / maxHeight > targetRatio) {
        height = maxHeight;
        width = maxHeight * targetRatio;
    } else {
        width = maxWidth;
        height = maxWidth / targetRatio;
    }
    
    return {
        width: Math.round(width),
        height: Math.round(height),
        isLandscape: isLandscape
    };
}

function initializeBook() {
    const sizes = calculateBookSize();
    const bookContainer = document.getElementById('book-container');
    
    // Set initial size of the container
    bookContainer.style.width = `${sizes.width}px`;
    bookContainer.style.height = `${sizes.height}px`;

    // Instantiate St.PageFlip
    pageFlipInstance = new St.PageFlip(document.getElementById('book'), {
        width: imageWidth,     // Width of a single page
        height: imageHeight,   // Height of a single page
        size: 'stretch',       // Stretches pages to fit the book container
        minWidth: 250,
        maxWidth: 2500,
        minHeight: 350,
        maxHeight: 2500,
        drawShadow: true,
        showCover: true,       // Pages 1 and 4 are covers; pages 2 and 3 show side-by-side
        usePortrait: true,     // Switch to single-page view on portrait viewports
        flippingTime: 800,     // 800ms for a more responsive, natural paper flip
        maxShadowOpacity: 0.3, // Stronger shadow opacity to make the paper bend/fold more visible
        swipeDistance: 15,     // Lower threshold for smoother touch triggers
        mobileScrollSupport: true
    });

    // Load pages from existing HTML (4 pages total)
    pageFlipInstance.loadFromHTML(document.querySelectorAll('.page'));

    // Force all pages (including covers) to be soft density to ensure they bend like paper
    applySoftDensity();
    updatePageVisibility('read');

    // Update controls and layout state
    updatePageIndicator();
    updateBookTranslation();

    // Attach PageFlip Events
    pageFlipInstance.on('flip', (e) => {
        playPageTurnSound();
        updatePageIndicator();
        updateBookTranslation();
        applySoftDensity();
        updatePageVisibility('read');
    });

    pageFlipInstance.on('changeOrientation', (e) => {
        updatePageIndicator();
        updateBookTranslation();
        applySoftDensity();
        updatePageVisibility('read');
    });

    pageFlipInstance.on('changeState', (e) => {
        updatePageVisibility(e.data);
    });
}

function applySoftDensity() {
    if (!pageFlipInstance) return;
    try {
        const pageCount = pageFlipInstance.getPageCount();
        for (let i = 0; i < pageCount; i++) {
            const page = pageFlipInstance.getPage(i);
            if (page) {
                if (typeof page.setDensity === 'function') {
                    page.setDensity('soft');
                }
                if (typeof page.setDrawingDensity === 'function') {
                    page.setDrawingDensity('soft');
                }
            }
        }
    } catch (e) {
        console.warn("Could not force soft density:", e);
    }
}

function updatePageVisibility(state = 'read') {
    if (!pageFlipInstance) return;
    
    const pages = document.querySelectorAll('.page');
    
    // In 'read' state, hide inactive pages to prevent them showing through the transparent wrappers
    const currentIndex = pageFlipInstance.getCurrentPageIndex();
    const orientation = pageFlipInstance.getOrientation();
    
    pages.forEach((page, index) => {
        let isVisible = false;
        
        if (orientation === 'landscape') {
            if (currentIndex === 0) {
                // Front Cover: only Page 1 (index 0) is visible
                isVisible = (index === 0);
            } else if (currentIndex === pages.length - 1) {
                // Back Cover: only Page 4 (index 3) is visible
                isVisible = (index === pages.length - 1);
            } else {
                // Inside spread: pages 2 and 3 (index 1 and 2) are visible
                isVisible = (index === 1 || index === 2);
            }
        } else {
            // Portrait mode: only the current page is visible
            isVisible = (index === currentIndex);
        }
        
        if (isVisible) {
            page.style.visibility = 'visible';
            page.style.opacity = '1';
        } else {
            page.style.visibility = 'hidden';
            page.style.opacity = '0';
        }
    });
}

function resizeBook() {
    if (!pageFlipInstance) return;
    
    // Reset zoom when resizing window
    if (zoomScale > 1.0) {
        zoomScale = 1.0;
        updateZoom();
    }

    const sizes = calculateBookSize();
    const bookContainer = document.getElementById('book-container');
    
    bookContainer.style.width = `${sizes.width}px`;
    bookContainer.style.height = `${sizes.height}px`;
    
    pageFlipInstance.update();
    applySoftDensity();
    updateBookTranslation();
    updatePageVisibility('read');
}

function updateBookTranslation() {
    if (!pageFlipInstance) return;
    
    const currentIndex = pageFlipInstance.getCurrentPageIndex();
    const totalPages = pageFlipInstance.getPageCount();
    const orientation = pageFlipInstance.getOrientation();
    const bookElement = document.getElementById('book');
    
    if (orientation === 'landscape') {
        if (currentIndex === 0) {
            // First page (Cover) -> Shift left by 25% of book container width to center it
            bookElement.style.transform = 'translateX(-25%)';
        } else if (currentIndex === totalPages - 1) {
            // Last page (Back Cover) -> Shift right by 25% to center it
            bookElement.style.transform = 'translateX(25%)';
        } else {
            // Inside spread -> Keep in the center
            bookElement.style.transform = 'translateX(0)';
        }
    } else {
        // Portrait mode -> Keep in the center
        bookElement.style.transform = 'translateX(0)';
    }
}

window.addEventListener('resize', resizeBook);

/* ==========================================================================
   UI CONTROLS & EVENT LISTENERS
   ========================================================================== */
function setupControls() {
    // Navigation arrows
    const prevBtn = document.getElementById('prev-page-btn');
    const nextBtn = document.getElementById('next-page-btn');

    prevBtn.addEventListener('click', () => {
        if (pageFlipInstance) pageFlipInstance.flipPrev();
    });

    nextBtn.addEventListener('click', () => {
        if (pageFlipInstance) pageFlipInstance.flipNext();
    });

    // Slider controls (slider maps directly to 4 pages: 0, 1, 2, 3)
    const slider = document.getElementById('page-slider');
    slider.addEventListener('input', (e) => {
        if (pageFlipInstance) {
            const pageIndex = parseInt(e.target.value);
            pageFlipInstance.turnToPage(pageIndex);
        }
    });

    // Sound toggle
    const soundBtn = document.getElementById('sound-btn');
    soundBtn.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        localStorage.setItem('soundEnabled', soundEnabled);
        updateSoundButtonUI();
    });

    // Zoom controls toggle & zoom panel actions
    const zoomBtn = document.getElementById('zoom-btn');
    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomOutBtn = document.getElementById('zoom-out-btn');
    const zoomResetBtn = document.getElementById('zoom-reset-btn');

    zoomBtn.addEventListener('click', () => {
        if (zoomScale > 1.0) {
            zoomScale = 1.0;
        } else {
            zoomScale = 1.5;
        }
        updateZoom();
    });

    zoomInBtn.addEventListener('click', () => {
        zoomScale = Math.min(zoomScale + 0.25, 3.0);
        updateZoom();
    });

    zoomOutBtn.addEventListener('click', () => {
        zoomScale = Math.max(zoomScale - 0.25, 1.0);
        updateZoom();
    });

    zoomResetBtn.addEventListener('click', () => {
        zoomScale = 1.0;
        updateZoom();
    });

    // Fullscreen control
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    fullscreenBtn.addEventListener('click', toggleFullscreen);

    // Sidebar table of contents controls
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const closeSidebarBtn = document.getElementById('close-sidebar-btn');

    sidebarToggleBtn.addEventListener('click', () => {
        sidebar.classList.add('open');
        sidebarOverlay.classList.add('visible');
    });

    closeSidebarBtn.addEventListener('click', () => {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('visible');
    });

    sidebarOverlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('visible');
    });

    // Sidebar thumbnails clicking (maps directly to page indices 0, 1, 2, 3)
    const thumbnails = document.querySelectorAll('.thumbnail-item');
    thumbnails.forEach((thumb) => {
        thumb.addEventListener('click', () => {
            const pageIdx = parseInt(thumb.getAttribute('data-page'));
            if (pageFlipInstance) {
                pageFlipInstance.turnToPage(pageIdx);
                sidebar.classList.remove('open');
                sidebarOverlay.classList.remove('visible');
            }
        });
    });

    // Keyboard navigation shortcuts
    document.addEventListener('keydown', (e) => {
        if (pageFlipInstance) {
            if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
                pageFlipInstance.flipNext();
            } else if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
                pageFlipInstance.flipPrev();
            } else if (e.key === 'Escape') {
                if (zoomScale > 1.0) {
                    zoomScale = 1.0;
                    updateZoom();
                }
                if (sidebar.classList.contains('open')) {
                    sidebar.classList.remove('open');
                    sidebarOverlay.classList.remove('visible');
                }
            } else if (e.key.toLowerCase() === 'f') {
                toggleFullscreen();
            } else if (e.key.toLowerCase() === 's') {
                soundBtn.click();
            }
        }
    });

    // Setup panning on zoomed book
    setupPanning();
}

/* ==========================================================================
   UI STATE UPDATERS
   ========================================================================== */
function updateSoundButtonUI() {
    const soundBtn = document.getElementById('sound-btn');
    const icon = soundBtn.querySelector('i');
    if (soundEnabled) {
        icon.className = "fa-solid fa-volume-high";
        soundBtn.title = "Mute Sound";
    } else {
        icon.className = "fa-solid fa-volume-xmark";
        soundBtn.title = "Unmute Sound";
    }
}

function updatePageIndicator() {
    if (!pageFlipInstance) return;

    const currentIndex = pageFlipInstance.getCurrentPageIndex();
    const totalPages = pageFlipInstance.getPageCount();
    const orientation = pageFlipInstance.getOrientation();
    
    let label = "";
    if (orientation === 'landscape') {
        if (currentIndex === 0) {
            label = `Front Cover (Page 1 of ${totalPages})`;
        } else if (currentIndex === totalPages - 1) {
            label = `Back Cover (Page ${totalPages} of ${totalPages})`;
        } else {
            // Left page index is currentIndex (index 1), right page is currentIndex + 1 (index 2)
            label = `Pages ${currentIndex + 1}-${currentIndex + 2} of ${totalPages}`;
        }
    } else {
        // Portrait / single page layout
        if (currentIndex === 0) {
            label = `Front Cover (Page 1 of ${totalPages})`;
        } else if (currentIndex === totalPages - 1) {
            label = `Back Cover (Page ${totalPages} of ${totalPages})`;
        } else {
            label = `Page ${currentIndex + 1} of ${totalPages}`;
        }
    }
    
    // Update text
    document.getElementById('page-number-display').textContent = label;
    
    // Update slider state (0 to 3)
    const slider = document.getElementById('page-slider');
    slider.max = totalPages - 1;
    slider.value = currentIndex;
    
    // Update custom slider progress background width
    const percentage = (currentIndex / (totalPages - 1)) * 100;
    document.getElementById('slider-progress').style.width = `${percentage}%`;
    
    // Show/hide arrows
    const prevBtn = document.getElementById('prev-page-btn');
    const nextBtn = document.getElementById('next-page-btn');
    
    if (currentIndex === 0) {
        prevBtn.classList.add('disabled');
    } else {
        prevBtn.classList.remove('disabled');
    }
    
    if (currentIndex === totalPages - 1) {
        nextBtn.classList.add('disabled');
    } else {
        nextBtn.classList.remove('disabled');
    }
    
    // Update active state in sidebar thumbnails list
    const thumbnails = document.querySelectorAll('.thumbnail-item');
    thumbnails.forEach((thumb, idx) => {
        if (idx === currentIndex) {
            thumb.classList.add('active');
        } else {
            thumb.classList.remove('active');
        }
    });
}

function updateZoom() {
    const bookContainer = document.getElementById('book-container');
    const zoomBtn = document.getElementById('zoom-btn');
    const zoomLevelText = document.getElementById('zoom-level');
    const zoomControlsPanel = document.getElementById('zoom-controls');
    const viewport = document.getElementById('zoom-viewport');
    
    if (zoomScale > 1.0) {
        // Apply transform scale
        bookContainer.style.transform = `scale(${zoomScale})`;
        viewport.classList.add('zoomed');
        
        // Update labels
        zoomLevelText.textContent = `${Math.round(zoomScale * 100)}%`;
        zoomControlsPanel.classList.remove('hidden');
        zoomBtn.classList.add('active');
        zoomBtn.querySelector('i').className = "fa-solid fa-magnifying-glass-minus";
    } else {
        zoomScale = 1.0;
        bookContainer.style.transform = `scale(1)`;
        viewport.classList.remove('zoomed');
        
        // Recenter scrollbars
        viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) / 2;
        viewport.scrollTop = (viewport.scrollHeight - viewport.clientHeight) / 2;
        
        zoomControlsPanel.classList.add('hidden');
        zoomBtn.classList.remove('active');
        zoomBtn.querySelector('i').className = "fa-solid fa-magnifying-glass-plus";
    }
}

/* ==========================================================================
   ZOOM PANNING MECHANICS (DRAG SCROLL)
   ========================================================================== */
function setupPanning() {
    const viewport = document.getElementById('zoom-viewport');
    
    // Desktop Mouse Drag to Scroll
    viewport.addEventListener('mousedown', (e) => {
        if (zoomScale <= 1.0) return;
        
        // Prevent trigger if clicking on buttons or inputs
        if (e.target.closest('.ctrl-btn') || e.target.closest('#book')) {
            const rect = document.getElementById('book-container').getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            
            // Only allow panning if not clicking near the page corners (corner fold areas)
            const margin = 80;
            const isNearCorner = 
                (clickX < margin || clickX > rect.width - margin);
                
            if (isNearCorner) return; // Let pageflip library handle corner turning
        }
        
        isDragging = true;
        viewport.classList.add('grabbing');
        
        startX = e.pageX - viewport.offsetLeft;
        startY = e.pageY - viewport.offsetTop;
        scrollLeft = viewport.scrollLeft;
        scrollTop = viewport.scrollTop;
    });

    viewport.addEventListener('mouseleave', () => {
        isDragging = false;
        viewport.classList.remove('grabbing');
    });

    viewport.addEventListener('mouseup', () => {
        isDragging = false;
        viewport.classList.remove('grabbing');
    });

    viewport.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        
        const x = e.pageX - viewport.offsetLeft;
        const y = e.pageY - viewport.offsetTop;
        const walkX = (x - startX) * 1.5; // multiplier adjusts scroll speed
        const walkY = (y - startY) * 1.5;
        
        viewport.scrollLeft = scrollLeft - walkX;
        viewport.scrollTop = scrollTop - walkY;
    });

    // Touch Support for Mobile devices
    viewport.addEventListener('touchstart', (e) => {
        if (zoomScale <= 1.0) return;
        
        const rect = document.getElementById('book-container').getBoundingClientRect();
        const touchX = e.touches[0].clientX - rect.left;
        const margin = 60;
        
        if (touchX < margin || touchX > rect.width - margin) return;
        
        isDragging = true;
        startX = e.touches[0].pageX - viewport.offsetLeft;
        startY = e.touches[0].pageY - viewport.offsetTop;
        scrollLeft = viewport.scrollLeft;
        scrollTop = viewport.scrollTop;
    }, { passive: true });

    viewport.addEventListener('touchend', () => {
        isDragging = false;
    });

    viewport.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        
        const x = e.touches[0].pageX - viewport.offsetLeft;
        const y = e.touches[0].pageY - viewport.offsetTop;
        const walkX = (x - startX) * 1.5;
        const walkY = (y - startY) * 1.5;
        
        viewport.scrollLeft = scrollLeft - walkX;
        viewport.scrollTop = scrollTop - walkY;
    }, { passive: true });
}

/* ==========================================================================
   FULLSCREEN UTILITIES
   ========================================================================== */
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().then(() => {
            document.getElementById('fullscreen-btn').querySelector('i').className = "fa-solid fa-compress";
            document.getElementById('fullscreen-btn').title = "Exit Fullscreen";
        }).catch(err => {
            console.error(`Error attempting to enable fullscreen: ${err.message}`);
        });
    } else {
        document.exitFullscreen().then(() => {
            document.getElementById('fullscreen-btn').querySelector('i').className = "fa-solid fa-expand";
            document.getElementById('fullscreen-btn').title = "Enter Fullscreen";
        });
    }
}
