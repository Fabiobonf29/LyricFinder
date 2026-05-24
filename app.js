/* ================================
   LyricFinder — App Logic
   Split View with Translation
   ================================ */

(function () {
    'use strict';

    // ---- DOM Elements ----
    const form = document.getElementById('search-form');
    const artistInput = document.getElementById('artist-input');
    const titleInput = document.getElementById('title-input');
    const searchBtn = document.getElementById('search-btn');
    const errorCard = document.getElementById('error-card');
    const errorTitle = document.getElementById('error-title');
    const errorMessage = document.getElementById('error-message');
    const retryBtn = document.getElementById('retry-btn');
    const lyricsCard = document.getElementById('lyrics-card');
    const lyricsSongTitle = document.getElementById('lyrics-song-title');
    const lyricsArtist = document.getElementById('lyrics-artist');
    const lyricsBody = document.getElementById('lyrics-body');
    const lyricsBodyTranslation = document.getElementById('lyrics-body-translation');
    const translationLoading = document.getElementById('translation-loading');
    const detectedLang = document.getElementById('detected-lang');
    const copyBtn = document.getElementById('copy-btn');
    const copyTranslationBtn = document.getElementById('copy-translation-btn');
    const newSearchBtn = document.getElementById('new-search-btn');
    const playBtn = document.getElementById('play-btn');
    const recentSection = document.getElementById('recent-section');
    const recentList = document.getElementById('recent-list');
    const toast = document.getElementById('toast');
    const toastText = document.getElementById('toast-text');
    const copyOverlay = document.getElementById('copy-overlay');

    // ---- State ----
    const STORAGE_KEY = 'lyricfinder_recent';
    const MAX_RECENT = 6;
    let currentLyrics = '';
    let currentTranslation = '';
    let currentArtist = '';
    let currentTitle = '';

    // ---- APIs ----
    const LYRICS_API_BASE = 'https://api.lyrics.ovh/v1';
    const TRANSLATE_API_BASE = 'https://api.mymemory.translated.net/get';

    /**
     * Fetch lyrics from the API
     */
    async function fetchLyrics(artist, title) {
        const url = `${LYRICS_API_BASE}/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
        const response = await fetch(url);

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('NOT_FOUND');
            }
            throw new Error('API_ERROR');
        }

        const data = await response.json();

        if (!data.lyrics || data.lyrics.trim().length === 0) {
            throw new Error('EMPTY');
        }

        return data.lyrics.trim();
    }

    /**
     * Detect the source language from the lyrics text
     * Simple heuristic based on common words
     */
    function detectLanguage(text) {
        const lowerText = text.toLowerCase();
        
        const langPatterns = {
            'en': /\b(the|and|you|is|are|was|were|have|has|will|would|could|should|can|this|that|with|from|not|but|for|all|just|like|love|know|want|need|come|baby|yeah|heart|time|night|life|world)\b/g,
            'es': /\b(el|la|los|las|de|del|en|con|por|para|que|una|como|pero|más|todo|esta|este|tengo|quiero|amor|corazón|vida|noche|tiempo|mundo|donde|cuando|porque|siempre)\b/g,
            'fr': /\b(le|la|les|des|du|de|en|et|dans|avec|pour|que|une|mais|plus|tout|cette|mon|mes|ton|tes|son|ses|pas|suis|est|sont|comme|amour|coeur|vie|nuit|temps|monde)\b/g,
            'de': /\b(der|die|das|den|dem|des|und|in|von|mit|auf|für|ist|nicht|ein|eine|aber|ich|du|er|sie|wir|mein|dein|sein|ihr|liebe|herz|leben|nacht|zeit|welt)\b/g,
            'pt': /\b(o|a|os|as|do|da|dos|das|de|em|com|por|para|que|uma|mas|mais|todo|esta|este|tenho|quero|amor|coração|vida|noite|tempo|mundo|onde|quando|porque|sempre)\b/g,
            'it': /\b(il|lo|la|le|gli|del|della|dei|delle|in|con|per|che|una|ma|più|tutto|questa|questo|ho|voglio|amore|cuore|vita|notte|tempo|mondo|dove|quando|perché|sempre|sono|sei|siamo)\b/g,
        };
        
        const scores = {};
        for (const [lang, pattern] of Object.entries(langPatterns)) {
            const matches = lowerText.match(pattern);
            scores[lang] = matches ? matches.length : 0;
        }
        
        let maxLang = 'en';
        let maxScore = 0;
        for (const [lang, score] of Object.entries(scores)) {
            if (score > maxScore) {
                maxScore = score;
                maxLang = lang;
            }
        }
        
        return maxLang;
    }

    /**
     * Get full language name from code
     */
    function getLangName(code) {
        const names = {
            'en': 'Inglese',
            'es': 'Spagnolo',
            'fr': 'Francese',
            'de': 'Tedesco',
            'pt': 'Portoghese',
            'it': 'Italiano',
        };
        return names[code] || code.toUpperCase();
    }

    /**
     * Translate text using MyMemory API
     * Splits long texts into chunks to respect API limits
     */
    async function translateText(text, sourceLang) {
        // If already Italian, no need to translate
        if (sourceLang === 'it') {
            return text;
        }

        const langPair = `${sourceLang}|it`;
        const lines = text.split('\n');
        
        // Group lines into chunks (MyMemory has a ~500 char limit per request)
        const chunks = [];
        let currentChunk = [];
        let currentLength = 0;
        const MAX_CHUNK_LENGTH = 450;

        for (const line of lines) {
            if (currentLength + line.length + 1 > MAX_CHUNK_LENGTH && currentChunk.length > 0) {
                chunks.push(currentChunk.join('\n'));
                currentChunk = [];
                currentLength = 0;
            }
            currentChunk.push(line);
            currentLength += line.length + 1;
        }
        if (currentChunk.length > 0) {
            chunks.push(currentChunk.join('\n'));
        }

        // Translate each chunk
        const translatedChunks = [];
        for (const chunk of chunks) {
            if (chunk.trim() === '') {
                translatedChunks.push('');
                continue;
            }

            try {
                const url = `${TRANSLATE_API_BASE}?q=${encodeURIComponent(chunk)}&langpair=${langPair}`;
                const response = await fetch(url);
                const data = await response.json();

                if (data.responseStatus === 200 && data.responseData && data.responseData.translatedText) {
                    translatedChunks.push(data.responseData.translatedText);
                } else {
                    translatedChunks.push(chunk); // Fallback: keep original
                }
            } catch {
                translatedChunks.push(chunk); // Fallback on error
            }
        }

        return translatedChunks.join('\n');
    }

    // ---- Search Handler ----
    async function handleSearch(artist, title) {
        // UI: loading state
        setLoading(true);
        hideResults();

        try {
            const lyrics = await fetchLyrics(artist, title);
            currentLyrics = lyrics;
            currentTranslation = '';
            currentArtist = artist;
            currentTitle = title;

            // Detect language
            const sourceLang = detectLanguage(lyrics);
            detectedLang.textContent = getLangName(sourceLang);

            // Display original lyrics
            lyricsSongTitle.textContent = title;
            lyricsArtist.textContent = artist;
            renderLyrics(lyrics, lyricsBody);

            // Show card with translation loading
            lyricsCard.classList.remove('hidden');
            showTranslationLoading();

            // Save to recent
            saveRecent(artist, title);

            // Scroll to results smoothly
            setTimeout(() => {
                lyricsCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 200);

            // Start translation (async, doesn't block UI)
            setLoading(false);
            
            if (sourceLang === 'it') {
                // Already Italian — show message
                currentTranslation = lyrics;
                renderTranslationMessage('Il testo è già in italiano! 🇮🇹');
            } else {
                try {
                    const translated = await translateText(lyrics, sourceLang);
                    currentTranslation = translated;
                    hideTranslationLoading();
                    renderLyrics(translated, lyricsBodyTranslation);
                } catch {
                    renderTranslationError();
                }
            }

        } catch (err) {
            showError(err.message);
            setLoading(false);
        }
    }

    /**
     * Render lyrics with animated lines into a target container
     */
    function renderLyrics(text, container) {
        container.innerHTML = '';
        const lines = text.split('\n');
        
        lines.forEach((line, index) => {
            const el = document.createElement('div');
            if (line.trim() === '') {
                el.className = 'lyrics-empty-line';
            } else {
                el.className = 'lyrics-line';
                el.textContent = line;
                el.style.animationDelay = `${Math.min(index * 30, 2000)}ms`;
            }
            container.appendChild(el);
        });
    }

    /**
     * Show translation loading spinner
     */
    function showTranslationLoading() {
        translationLoading.classList.remove('hidden');
        // Remove any previous translated content (but keep the loading div)
        const children = Array.from(lyricsBodyTranslation.children);
        children.forEach(child => {
            if (child !== translationLoading) child.remove();
        });
        translationLoading.innerHTML = `
            <div class="translation-spinner"></div>
            <span>Traduzione in corso...</span>
        `;
    }

    /**
     * Hide translation loading spinner
     */
    function hideTranslationLoading() {
        translationLoading.classList.add('hidden');
    }

    /**
     * Show a message in the translation panel (e.g., already Italian)
     */
    function renderTranslationMessage(message) {
        hideTranslationLoading();
        const el = document.createElement('div');
        el.className = 'translation-error';
        el.innerHTML = `<div class="translation-error-icon">🇮🇹</div><p>${message}</p>`;
        lyricsBodyTranslation.appendChild(el);
    }

    /**
     * Show translation error
     */
    function renderTranslationError() {
        hideTranslationLoading();
        const el = document.createElement('div');
        el.className = 'translation-error';
        el.innerHTML = `
            <div class="translation-error-icon">⚠️</div>
            <p>Traduzione non disponibile al momento.<br>Riprova più tardi.</p>
        `;
        lyricsBodyTranslation.appendChild(el);
    }

    // ---- UI Helpers ----

    function setLoading(loading) {
        if (loading) {
            searchBtn.classList.add('loading');
            searchBtn.disabled = true;
        } else {
            searchBtn.classList.remove('loading');
            searchBtn.disabled = false;
        }
    }

    function hideResults() {
        errorCard.classList.add('hidden');
        lyricsCard.classList.add('hidden');
    }

    function showError(type) {
        switch (type) {
            case 'NOT_FOUND':
                errorTitle.textContent = 'Testo non trovato';
                errorMessage.textContent = 'Non siamo riusciti a trovare il testo. Controlla il nome dell\'artista e il titolo della canzone.';
                break;
            case 'EMPTY':
                errorTitle.textContent = 'Testo vuoto';
                errorMessage.textContent = 'Il testo di questa canzone non è disponibile al momento.';
                break;
            default:
                errorTitle.textContent = 'Errore di connessione';
                errorMessage.textContent = 'Si è verificato un errore. Controlla la tua connessione internet e riprova.';
        }
        errorCard.classList.remove('hidden');

        setTimeout(() => {
            errorCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
    }

    function showToast(message, duration = 2500) {
        toastText.textContent = message;
        toast.classList.remove('hidden');

        // Force reflow for animation restart
        void toast.offsetWidth;
        toast.classList.add('visible');

        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.classList.add('hidden'), 400);
        }, duration);
    }

    // ---- Copy to Clipboard ----
    async function copyToClipboard(text, label) {
        if (!text) return;

        try {
            await navigator.clipboard.writeText(text);
        } catch {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }

        // Show overlay animation
        copyOverlay.classList.remove('hidden');
        void copyOverlay.offsetWidth;
        copyOverlay.classList.add('visible');

        setTimeout(() => {
            copyOverlay.classList.remove('visible');
            setTimeout(() => copyOverlay.classList.add('hidden'), 300);
        }, 800);

        showToast(`${label} copiato negli appunti ✓`);
    }

    // ---- Synchronized Scrolling ----
    function setupSyncScroll() {
        let isSyncing = false;

        lyricsBody.addEventListener('scroll', () => {
            if (isSyncing) return;
            isSyncing = true;
            const ratio = lyricsBody.scrollTop / (lyricsBody.scrollHeight - lyricsBody.clientHeight || 1);
            lyricsBodyTranslation.scrollTop = ratio * (lyricsBodyTranslation.scrollHeight - lyricsBodyTranslation.clientHeight);
            requestAnimationFrame(() => { isSyncing = false; });
        });

        lyricsBodyTranslation.addEventListener('scroll', () => {
            if (isSyncing) return;
            isSyncing = true;
            const ratio = lyricsBodyTranslation.scrollTop / (lyricsBodyTranslation.scrollHeight - lyricsBodyTranslation.clientHeight || 1);
            lyricsBody.scrollTop = ratio * (lyricsBody.scrollHeight - lyricsBody.clientHeight);
            requestAnimationFrame(() => { isSyncing = false; });
        });
    }

    // ---- Recent Searches (localStorage) ----

    function getRecent() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        } catch {
            return [];
        }
    }

    function saveRecent(artist, title) {
        let recent = getRecent();

        // Remove duplicate if exists
        recent = recent.filter(
            (r) => !(r.artist.toLowerCase() === artist.toLowerCase() && r.title.toLowerCase() === title.toLowerCase())
        );

        // Add to front
        recent.unshift({ artist, title, timestamp: Date.now() });

        // Limit
        if (recent.length > MAX_RECENT) {
            recent = recent.slice(0, MAX_RECENT);
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify(recent));
        renderRecent();
    }

    function renderRecent() {
        const recent = getRecent();

        if (recent.length === 0) {
            recentSection.classList.add('hidden');
            return;
        }

        recentSection.classList.remove('hidden');
        recentList.innerHTML = '';

        recent.forEach((item, index) => {
            const el = document.createElement('div');
            el.className = 'recent-item';
            el.style.animationDelay = `${index * 60}ms`;
            el.innerHTML = `
                <div class="recent-item-icon">🎶</div>
                <div class="recent-item-info">
                    <div class="recent-item-title">${escapeHTML(item.title)}</div>
                    <div class="recent-item-artist">${escapeHTML(item.artist)}</div>
                </div>
                <svg class="recent-item-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="m9 18 6-6-6-6"/>
                </svg>
            `;

            el.addEventListener('click', () => {
                artistInput.value = item.artist;
                titleInput.value = item.title;
                handleSearch(item.artist, item.title);

                // Scroll up
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });

            recentList.appendChild(el);
        });
    }

    function escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ---- Event Listeners ----

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const artist = artistInput.value.trim();
        const title = titleInput.value.trim();

        if (!artist || !title) return;

        handleSearch(artist, title);
    });

    retryBtn.addEventListener('click', () => {
        hideResults();
        artistInput.focus();
    });

    copyBtn.addEventListener('click', () => copyToClipboard(currentLyrics, 'Testo originale'));
    copyTranslationBtn.addEventListener('click', () => copyToClipboard(currentTranslation, 'Traduzione'));

    playBtn.addEventListener('click', () => {
        if (!currentArtist || !currentTitle) return;
        const query = encodeURIComponent(`${currentArtist} ${currentTitle}`);
        window.open(`https://www.youtube.com/results?search_query=${query}`, '_blank');
    });

    newSearchBtn.addEventListener('click', () => {
        hideResults();
        artistInput.value = '';
        titleInput.value = '';
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(() => artistInput.focus(), 400);
    });

    // ---- Keyboard Accessibility ----
    document.addEventListener('keydown', (e) => {
        // ESC to close lyrics and return to search
        if (e.key === 'Escape') {
            if (!lyricsCard.classList.contains('hidden')) {
                hideResults();
                window.scrollTo({ top: 0, behavior: 'smooth' });
                artistInput.focus();
            }
        }
    });

    // ---- iOS input zoom prevention ----
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        const inputs = document.querySelectorAll('input[type="text"]');
        inputs.forEach(input => {
            input.addEventListener('focus', () => {
                input.style.fontSize = '16px';
            });
            input.addEventListener('blur', () => {
                input.style.fontSize = '';
            });
        });
    }

    // ---- Init ----
    function init() {
        renderRecent();
        setupSyncScroll();
        artistInput.focus();

        // Register Service Worker for PWA / offline support
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js').then(() => {
                console.log('Service Worker registered');
            }).catch((err) => {
                console.warn('Service Worker registration failed:', err);
            });
        }
    }

    // Start when DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
