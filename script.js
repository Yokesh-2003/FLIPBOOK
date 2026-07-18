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
let mouseEventY = 0; // Track mouse Y coordinate globally

// Track mouse position globally
document.addEventListener('mousemove', (e) => {
    mouseEventY = e.clientY;
});

// Preload user's custom page turn sound effect (page.mp3)
const pageFlipAudio = new Audio("page.mp3");
pageFlipAudio.preload = "auto";

// Preload corner hover sound effects
const topAudio = new Audio("top.mp3");
topAudio.preload = "auto";

const bottomAudio = new Audio("bottom.mp3");
bottomAudio.preload = "auto";

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
    if (!soundEnabled || document.body.classList.contains('show-reviews')) return;

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
 * Plays the top corner hover sound effect
 */
function playTopSound() {
    if (!soundEnabled || document.body.classList.contains('show-reviews')) return;
    topAudio.currentTime = 0;
    topAudio.play().catch(err => {
        console.warn("Failed to play top.mp3:", err);
    });
}

/**
 * Plays the bottom corner hover sound effect
 */
function playBottomSound() {
    if (!soundEnabled || document.body.classList.contains('show-reviews')) return;
    bottomAudio.currentTime = 0;
    bottomAudio.play().catch(err => {
        console.warn("Failed to play bottom.mp3:", err);
    });
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

    // Leave safe paddings — minimal on mobile so the book fills the screen
    const isMobileView = viewportWidth < 768;
    const marginHorizontal = isLandscape ? 80 : (isMobileView ? 8 : 24);
    const marginVertical = isMobileView ? 8 : 50;

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
        swipeDistance: 1,      // Minimum - any slight swipe triggers a flip
        mobileScrollSupport: false // MUST be false — true blocks touch swipe page flipping
    });

    // Load pages from existing HTML (4 pages total)
    pageFlipInstance.loadFromHTML(document.querySelectorAll('.page'));

    // Force all pages (including covers) to be soft density to ensure they bend like paper
    applySoftDensity();

    // Update controls and layout state
    updatePageIndicator();
    updateBookTranslation();

    // Attach PageFlip Events
    pageFlipInstance.on('flip', (e) => {
        playPageTurnSound();
        updatePageIndicator();
        updateBookTranslation();
        applySoftDensity();
    });

    pageFlipInstance.on('changeOrientation', (e) => {
        updatePageIndicator();
        updateBookTranslation();
        applySoftDensity();
    });

    pageFlipInstance.on('changeState', (e) => {
        if (e.data === 'fold_corner') {
            const bookElement = document.getElementById('book');
            if (bookElement) {
                const rect = bookElement.getBoundingClientRect();
                const centerY = rect.top + rect.height / 2;
                if (mouseEventY < centerY) {
                    playTopSound();
                } else {
                    playBottomSound();
                }
            }
        }
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
}

function updateBookTranslation() {
    if (!pageFlipInstance) return;

    const currentIndex = pageFlipInstance.getCurrentPageIndex();
    const totalPages = pageFlipInstance.getPageCount();
    const orientation = pageFlipInstance.getOrientation();
    const bookElement = document.getElementById('book');
    const prevBtn = document.getElementById('prev-page-btn');
    const nextBtn = document.getElementById('next-page-btn');

    let shift = '0px';
    if (orientation === 'landscape') {
        if (currentIndex === 0) {
            // First page (Cover) -> Shift left by 25% of book container width to center it
            shift = '-25%';
        } else if (currentIndex === totalPages - 1) {
            // Last page (Back Cover) -> Shift right by 25% to center it
            shift = '25%';
        }
    }

    bookElement.style.transform = `translateX(${shift})`;
    if (prevBtn) prevBtn.style.transform = `translateX(${shift})`;
    if (nextBtn) nextBtn.style.transform = `translateX(${shift})`;
}

window.addEventListener('resize', resizeBook);

/* ==========================================================================
   UI CONTROLS & EVENT LISTENERS
   ========================================================================== */
function setupControls() {
    // Navigation arrows (desktop)
    const prevBtn = document.getElementById('prev-page-btn');
    const nextBtn = document.getElementById('next-page-btn');

    prevBtn.addEventListener('click', () => {
        if (pageFlipInstance) pageFlipInstance.flipPrev();
    });

    nextBtn.addEventListener('click', () => {
        if (pageFlipInstance) pageFlipInstance.flipNext();
    });

    // Mobile navigation arrows (below the book in footer)
    const mobilePrevBtn = document.getElementById('mobile-prev-btn');
    const mobileNextBtn = document.getElementById('mobile-next-btn');

    if (mobilePrevBtn) mobilePrevBtn.addEventListener('click', () => {
        if (pageFlipInstance) pageFlipInstance.flipPrev();
    });
    if (mobileNextBtn) mobileNextBtn.addEventListener('click', () => {
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

    // Review and Brochure buttons controls (both in footer AND inside reviews page)
    const reviewBtn     = document.getElementById('review-btn');
    const brochureBtn   = document.getElementById('brochure-btn');
    const reviewBtn2    = document.getElementById('review-btn-2');
    const brochureBtn2  = document.getElementById('brochure-btn-2');

    function setActiveView(view) {
        // view: 'brochure' or 'review'
        if (view === 'review') {
            document.body.classList.add('show-reviews');
            [reviewBtn, reviewBtn2].forEach(b => b && b.classList.add('active'));
            [brochureBtn, brochureBtn2].forEach(b => b && b.classList.remove('active'));
            // Recalculate track layout when switching page
            setTimeout(() => { if (window.refreshReviewsCarousel) window.refreshReviewsCarousel(); }, 50);
        } else {
            document.body.classList.remove('show-reviews');
            [brochureBtn, brochureBtn2].forEach(b => b && b.classList.add('active'));
            [reviewBtn, reviewBtn2].forEach(b => b && b.classList.remove('active'));
        }
        // Close sidebar if open
        const sidebar = document.getElementById('sidebar');
        const sidebarOverlay = document.getElementById('sidebar-overlay');
        if (sidebar && sidebar.classList.contains('open')) {
            sidebar.classList.remove('open');
            sidebarOverlay && sidebarOverlay.classList.remove('visible');
        }
    }

    [reviewBtn, reviewBtn2].forEach(btn => {
        if (btn) btn.addEventListener('click', (e) => { e.preventDefault(); setActiveView('review'); });
    });

    [brochureBtn, brochureBtn2].forEach(btn => {
        if (btn) btn.addEventListener('click', (e) => { e.preventDefault(); setActiveView('brochure'); });
    });

    // Initialize Reviews Carousel
    initReviewsCarousel();
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

    // Update mobile page label  (e.g. "2 / 4")
    const mobileLabel = document.getElementById('mobile-page-label');
    if (mobileLabel) mobileLabel.textContent = `${currentIndex + 1} / ${totalPages}`;

    // Disable mobile arrows at boundaries
    const mobilePrevBtn = document.getElementById('mobile-prev-btn');
    const mobileNextBtn = document.getElementById('mobile-next-btn');
    if (mobilePrevBtn) mobilePrevBtn.disabled = currentIndex === 0;
    if (mobileNextBtn) mobileNextBtn.disabled = currentIndex === totalPages - 1;
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

/* ==========================================================================
   REVIEWS CAROUSEL UTILITIES
   ========================================================================== */
let reviewCurrentIndex = 0;
let reviewInterval = null;

function initReviewsCarousel() {
    const track = document.getElementById('reviews-track');
    const cards = document.querySelectorAll('.review-card');
    const dotsContainer = document.getElementById('carousel-dots');
    
    if (!track || cards.length === 0) return;

    // Generate dots
    function setupDots() {
        if (!dotsContainer) return;
        dotsContainer.innerHTML = '';
        const isMobile = window.innerWidth < 768;
        const totalPages = isMobile ? cards.length : Math.ceil(cards.length / 3);

        for (let i = 0; i < totalPages; i++) {
            const dot = document.createElement('button');
            dot.className = `carousel-dot ${i === reviewCurrentIndex ? 'active' : ''}`;
            dot.addEventListener('click', () => {
                goToReviewPage(i);
                resetReviewTimer();
            });
            dotsContainer.appendChild(dot);
        }
    }

    function updateCarousel() {
        const isMobile = window.innerWidth < 768;
        let targetCardIndex = 0;
        
        if (isMobile) {
            targetCardIndex = reviewCurrentIndex;
        } else {
            // Group of 3
            targetCardIndex = reviewCurrentIndex * 3;
        }

        const targetCard = cards[targetCardIndex];
        if (targetCard) {
            const offset = targetCard.offsetLeft;
            track.style.transform = `translateX(-${offset}px)`;
        }

        // Update dots
        if (dotsContainer) {
            const dots = dotsContainer.querySelectorAll('.carousel-dot');
            dots.forEach((dot, idx) => {
                dot.classList.toggle('active', idx === reviewCurrentIndex);
            });
        }
    }

    function goToReviewPage(pageIdx) {
        const isMobile = window.innerWidth < 768;
        const totalPages = isMobile ? cards.length : Math.ceil(cards.length / 3);
        
        reviewCurrentIndex = (pageIdx + totalPages) % totalPages;
        updateCarousel();
    }

    function startReviewTimer() {
        reviewInterval = setInterval(() => {
            const isMobile = window.innerWidth < 768;
            const totalPages = isMobile ? cards.length : Math.ceil(cards.length / 3);
            if (totalPages > 0) {
                reviewCurrentIndex = (reviewCurrentIndex + 1) % totalPages;
                updateCarousel();
            }
        }, 3000); // 3 seconds
    }

    function resetReviewTimer() {
        clearInterval(reviewInterval);
        startReviewTimer();
    }

    // Initialize dots and display
    setupDots();
    updateCarousel();
    startReviewTimer();

    // Arrow controls
    const prevBtn = document.getElementById('review-prev-btn');
    const nextBtn = document.getElementById('review-next-btn');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            goToReviewPage(reviewCurrentIndex - 1);
            resetReviewTimer();
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            goToReviewPage(reviewCurrentIndex + 1);
            resetReviewTimer();
        });
    }

    // Resize handler
    window.addEventListener('resize', () => {
        const isMobile = window.innerWidth < 768;
        const totalPages = isMobile ? cards.length : Math.ceil(cards.length / 3);
        if (reviewCurrentIndex >= totalPages) {
            reviewCurrentIndex = totalPages - 1;
        }
        setupDots();
        updateCarousel();
    });

    // Expose refresh function globally to handle dynamic display updates
    window.refreshReviewsCarousel = () => {
        setupDots();
        updateCarousel();
    };
}
