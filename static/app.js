/**
 * Piper Desktop TTS Studio — Frontend Engine
 * Handles tab routing, heartbeat watchdog, audio synthesis, presets, and project collections.
 */

document.addEventListener("DOMContentLoaded", () => {
    // -------------------------------------------------------------------------
    // Heartbeat & Process Cleanup on Window Unload
    // -------------------------------------------------------------------------
    function sendHeartbeat() {
        fetch("/api/heartbeat", { method: "POST" })
            .then(res => res.json())
            .then(data => {
                const badgeText = document.getElementById("backend-status-text");
                if (badgeText) badgeText.textContent = "Engine Connected";
            })
            .catch(() => {
                const badgeText = document.getElementById("backend-status-text");
                if (badgeText) badgeText.textContent = "Reconnecting...";
            });
    }

    // Ping backend every 6 seconds to keep watchdog alive
    setInterval(sendHeartbeat, 6000);
    sendHeartbeat();

    // Clean shutdown on close/unload
    window.addEventListener("beforeunload", () => {
        if (navigator.sendBeacon) {
            navigator.sendBeacon("/api/shutdown");
        } else {
            fetch("/api/shutdown", { method: "POST", keepalive: true }).catch(() => {});
        }
    });

    // -------------------------------------------------------------------------
    // Tab Navigation Routing
    // -------------------------------------------------------------------------
    const tabButtons = document.querySelectorAll(".tab-btn");
    const tabPanes = document.querySelectorAll(".tab-pane");

    function switchTab(targetTabId) {
        tabButtons.forEach(btn => {
            if (btn.dataset.tab === targetTabId) {
                btn.classList.add("active");
            } else {
                btn.classList.remove("active");
            }
        });

        tabPanes.forEach(pane => {
            if (pane.id === targetTabId) {
                pane.classList.add("active");
            } else {
                pane.classList.remove("active");
            }
        });

        if (targetTabId === "tab-history") {
            loadHistory();
        } else if (targetTabId === "tab-collections") {
            loadCollections();
        }
    }

    tabButtons.forEach(btn => {
        btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

    // -------------------------------------------------------------------------
    // Global Audio Player Bar
    // -------------------------------------------------------------------------
    const audioPlayerBar = document.getElementById("audio-player-bar");
    const globalAudio = document.getElementById("global-audio-element");
    const playerTitle = document.getElementById("player-title");
    const playerSubtext = document.getElementById("player-subtext");
    const btnDownloadAudio = document.getElementById("btn-download-audio");

    let playlistQueue = [];
    let currentPlaylistIndex = -1;

    function playAudioTrack(url, title, subtext) {
        if (!url) return;
        audioPlayerBar.classList.add("active");
        playerTitle.textContent = title || "Synthesized Speech";
        playerSubtext.textContent = subtext || "Piper Neural Audio";
        btnDownloadAudio.href = url;
        btnDownloadAudio.download = `${(title || 'tts_audio').toLowerCase().replace(/[^a-z0-9]/g, '_')}.wav`;

        globalAudio.src = `${url}?t=${Date.now()}`;
        globalAudio.play().catch(e => console.log("Audio autoplay prevented:", e));
    }

    globalAudio.addEventListener("ended", () => {
        if (currentPlaylistIndex >= 0 && currentPlaylistIndex < playlistQueue.length - 1) {
            currentPlaylistIndex++;
            const nextTrack = playlistQueue[currentPlaylistIndex];
            playAudioTrack(nextTrack.audio_url, nextTrack.title, nextTrack.subtext);
        }
    });

    // -------------------------------------------------------------------------
    // Voice Models & Download Status
    // -------------------------------------------------------------------------
    let availableVoices = [];
    const voiceSelector = document.getElementById("voice-selector");
    const voiceCachedIndicator = document.getElementById("voice-cached-indicator");
    const voiceDetailsText = document.getElementById("voice-details-text");

    function updateVoiceInfoDisplay() {
        const selectedKey = voiceSelector.value;
        const voiceObj = availableVoices.find(v => v.key === selectedKey);
        if (!voiceObj) return;

        if (voiceObj.is_cached) {
            voiceCachedIndicator.textContent = "Cached Offline";
            voiceCachedIndicator.style.borderColor = "var(--success)";
            voiceCachedIndicator.style.color = "var(--success)";
        } else {
            voiceCachedIndicator.textContent = "Download Needed (~30-60 MB)";
            voiceCachedIndicator.style.borderColor = "var(--warning)";
            voiceCachedIndicator.style.color = "var(--warning)";
        }

        voiceDetailsText.textContent = `${voiceObj.language} • ${voiceObj.gender} • ${voiceObj.quality}`;
    }

    async function fetchVoices() {
        try {
            const res = await fetch("/api/voices");
            availableVoices = await res.json();
            voiceSelector.innerHTML = "";
            availableVoices.forEach(v => {
                const opt = document.createElement("option");
                opt.value = v.key;
                opt.textContent = v.name;
                voiceSelector.appendChild(opt);
            });
            updateVoiceInfoDisplay();
        } catch (e) {
            console.error("Failed to load voices:", e);
        }
    }

    voiceSelector.addEventListener("change", updateVoiceInfoDisplay);

    // -------------------------------------------------------------------------
    // Real-Time Text Area Counters & Sample Text Loader
    // -------------------------------------------------------------------------
    const inputTitle = document.getElementById("input-title");
    const inputText = document.getElementById("input-text");
    const textCounters = document.getElementById("text-counters");
    const btnClearText = document.getElementById("btn-clear-text");

    function updateTextStats() {
        const text = inputText.value.trim();
        const chars = text.length;
        const words = text ? text.split(/\s+/).length : 0;
        textCounters.textContent = `${words.toLocaleString()} words • ${chars.toLocaleString()} characters`;
    }

    inputText.addEventListener("input", updateTextStats);

    if (btnClearText) {
        btnClearText.addEventListener("click", () => {
            inputText.value = "";
            updateTextStats();
            inputText.focus();
        });
    }

    // -------------------------------------------------------------------------
    // Sliders & Controls
    // -------------------------------------------------------------------------
    const sliderSpeed = document.getElementById("slider-speed");
    const valSpeed = document.getElementById("val-speed");
    const sliderPause = document.getElementById("slider-pause");
    const valPause = document.getElementById("val-pause");

    sliderSpeed.addEventListener("input", () => {
        valSpeed.textContent = `${parseFloat(sliderSpeed.value).toFixed(2)}x`;
    });

    sliderPause.addEventListener("input", () => {
        valPause.textContent = `${parseFloat(sliderPause.value).toFixed(2)}s`;
    });

    // -------------------------------------------------------------------------
    // Voice Preview
    // -------------------------------------------------------------------------
    const btnPreviewVoice = document.getElementById("btn-preview-voice");

    btnPreviewVoice.addEventListener("click", async () => {
        const selectedVoice = voiceSelector.value;
        btnPreviewVoice.disabled = true;
        btnPreviewVoice.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" class="animate-spin" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 6v6l4 2"></path>
            </svg>
            Generating...
        `;

        try {
            const res = await fetch("/api/preview", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ voice: selectedVoice })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                playAudioTrack(data.audio_url, "Voice Preview", selectedVoice);
                // Mark voice as cached
                const v = availableVoices.find(item => item.key === selectedVoice);
                if (v) v.is_cached = true;
                updateVoiceInfoDisplay();
            } else {
                showError(data.error || "Preview generation failed");
            }
        } catch (err) {
            showError("Network or server connection error: " + err.message);
        } finally {
            btnPreviewVoice.disabled = false;
            btnPreviewVoice.innerHTML = `
                <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                Preview
            `;
        }
    });

    // -------------------------------------------------------------------------
    // Full Audio Synthesis
    // -------------------------------------------------------------------------
    const btnSynthesize = document.getElementById("btn-synthesize");
    const progressBox = document.getElementById("progress-box");
    const progressStatusText = document.getElementById("progress-status-text");
    const alertError = document.getElementById("alert-error");
    const errorMessageText = document.getElementById("error-message-text");

    function showError(msg) {
        errorMessageText.textContent = msg;
        alertError.classList.add("active");
    }

    function hideError() {
        alertError.classList.remove("active");
    }

    btnSynthesize.addEventListener("click", async () => {
        const text = inputText.value.trim();
        const title = inputTitle.value.trim() || "Untitled";
        const voice = voiceSelector.value;
        const speed = parseFloat(sliderSpeed.value);
        const pause_silence = parseFloat(sliderPause.value);

        if (!text) {
            showError("Please enter some text before synthesizing.");
            inputText.focus();
            return;
        }

        hideError();
        btnSynthesize.disabled = true;
        progressBox.classList.add("active");
        progressStatusText.textContent = "Acquiring neural model & generating speech...";

        try {
            const res = await fetch("/api/synthesize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text, title, voice, speed, pause_silence })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                progressStatusText.textContent = "Synthesis complete!";
                setTimeout(() => progressBox.classList.remove("active"), 1200);

                // Update voice cached status locally
                const v = availableVoices.find(item => item.key === voice);
                if (v) v.is_cached = true;
                updateVoiceInfoDisplay();

                // Play generated track
                playAudioTrack(data.audio_url, data.title, data.voice_name);
            } else {
                progressBox.classList.remove("active");
                showError(data.error || "Synthesis failed on server.");
            }
        } catch (err) {
            progressBox.classList.remove("active");
            showError("Network/Execution error: " + err.message);
        } finally {
            btnSynthesize.disabled = false;
        }
    });

    // -------------------------------------------------------------------------
    // Tab 2: History & Presets
    // -------------------------------------------------------------------------
    const historyContainer = document.getElementById("history-container");
    const btnRefreshHistory = document.getElementById("btn-refresh-history");

    async function loadHistory() {
        historyContainer.innerHTML = '<div class="empty-state"><p>Loading generation logs...</p></div>';
        try {
            const res = await fetch("/api/history");
            const history = await res.json();

            if (!history.length) {
                historyContainer.innerHTML = `
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        <h3>No Generation History</h3>
                        <p>Synthesized chapters and speech passages will appear here with full parameters and instant replay.</p>
                    </div>
                `;
                return;
            }

            historyContainer.innerHTML = "";
            history.forEach(item => {
                const card = document.createElement("div");
                card.className = "history-item";
                card.innerHTML = `
                    <div class="history-header">
                        <div class="history-title-group">
                            <h3>${escapeHtml(item.title)}</h3>
                            <div class="history-meta-pills">
                                <span class="meta-pill">${escapeHtml(item.voice_name)}</span>
                                <span class="meta-pill">${item.speed}x speed</span>
                                <span class="meta-pill">${item.word_count} words</span>
                                <span class="meta-pill">${item.created_at}</span>
                            </div>
                        </div>
                        <div class="history-actions">
                            <button class="btn btn-secondary btn-sm btn-play-history" data-url="${item.audio_url}" data-title="${escapeHtml(item.title)}" data-sub="${escapeHtml(item.voice_name)}">
                                <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                                </svg>
                                Play
                            </button>
                            <button class="btn btn-secondary btn-sm btn-use-preset" data-item='${escapeHtml(JSON.stringify(item))}'>
                                <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
                                </svg>
                                Use as Preset
                            </button>
                            <button class="btn btn-secondary btn-sm btn-open-add-col" data-id="${item.id}" data-title="${escapeHtml(item.title)}">
                                <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                </svg>
                                Add to Project
                            </button>
                            <button class="btn btn-danger btn-sm btn-delete-history" data-id="${item.id}">
                                <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div class="history-text-snippet">${escapeHtml(item.text)}</div>
                `;
                historyContainer.appendChild(card);
            });

            attachHistoryEventListeners();
        } catch (e) {
            historyContainer.innerHTML = '<div class="empty-state"><p>Error loading history logs.</p></div>';
        }
    }

    btnRefreshHistory.addEventListener("click", loadHistory);

    function attachHistoryEventListeners() {
        document.querySelectorAll(".btn-play-history").forEach(btn => {
            btn.addEventListener("click", () => {
                playAudioTrack(btn.dataset.url, btn.dataset.title, btn.dataset.sub);
            });
        });

        document.querySelectorAll(".btn-use-preset").forEach(btn => {
            btn.addEventListener("click", () => {
                const item = JSON.parse(btn.dataset.item);
                inputTitle.value = item.title;
                inputText.value = item.text;
                voiceSelector.value = item.voice;
                sliderSpeed.value = item.speed;
                valSpeed.textContent = `${parseFloat(item.speed).toFixed(2)}x`;
                sliderPause.value = item.pause_silence || 0.2;
                valPause.textContent = `${parseFloat(item.pause_silence || 0.2).toFixed(2)}s`;

                updateTextStats();
                updateVoiceInfoDisplay();
                switchTab("tab-dashboard");
            });
        });

        document.querySelectorAll(".btn-open-add-col").forEach(btn => {
            btn.addEventListener("click", () => {
                openAddToCollectionModal(btn.dataset.id, btn.dataset.title);
            });
        });

        document.querySelectorAll(".btn-delete-history").forEach(btn => {
            btn.addEventListener("click", async () => {
                if (confirm("Delete this generated audio track?")) {
                    await fetch(`/api/history/delete/${btn.dataset.id}`, { method: "POST" });
                    loadHistory();
                }
            });
        });
    }

    // -------------------------------------------------------------------------
    // Tab 3: Collections / Audiobook Projects
    // -------------------------------------------------------------------------
    const collectionsContainer = document.getElementById("collections-container");
    const btnNewCollection = document.getElementById("btn-new-collection");
    let cachedCollections = [];

    async function loadCollections() {
        collectionsContainer.innerHTML = '<div class="empty-state"><p>Loading projects...</p></div>';
        try {
            const res = await fetch("/api/collections");
            cachedCollections = await res.json();

            if (!cachedCollections.length) {
                collectionsContainer.innerHTML = `
                    <div class="empty-state" style="grid-column: 1 / -1;">
                        <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                        </svg>
                        <h3>No Audiobook Projects Yet</h3>
                        <p>Create a project to assemble synthesized passages into ordered chapters and seamless audio playlists.</p>
                    </div>
                `;
                return;
            }

            collectionsContainer.innerHTML = "";
            cachedCollections.forEach(col => {
                const card = document.createElement("div");
                card.className = "collection-card";

                let chaptersHtml = "";
                if (col.items && col.items.length) {
                    chaptersHtml = col.items.map((it, idx) => `
                        <div class="chapter-item">
                            <div class="chapter-info">
                                <span class="chapter-index">#${idx + 1}</span>
                                <span title="${escapeHtml(it.chapter_title)}">${escapeHtml(it.chapter_title)}</span>
                            </div>
                            <div class="chapter-actions">
                                <button class="btn btn-secondary btn-sm btn-play-chapter" data-url="${it.audio_url}" data-title="${escapeHtml(it.chapter_title)}" data-col="${escapeHtml(col.name)}">
                                    <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                                    </svg>
                                </button>
                                <button class="btn btn-danger btn-sm btn-del-chapter" data-id="${it.item_id}">
                                    <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    `).join("");
                } else {
                    chaptersHtml = '<p style="font-size: 0.75rem; color: var(--text-dim); padding: 8px;">No chapters assigned. Use "Add to Project" from History.</p>';
                }

                card.innerHTML = `
                    <div>
                        <div class="collection-card-header">
                            <div>
                                <h3>${escapeHtml(col.name)}</h3>
                                <span class="meta-pill" style="margin-top: 4px;">${(col.items || []).length} Chapters</span>
                            </div>
                            <button class="btn btn-danger btn-sm btn-delete-col" data-id="${col.id}" title="Delete project">
                                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                            </button>
                        </div>
                        <p class="collection-desc">${escapeHtml(col.description || 'No description provided.')}</p>
                        <div class="chapters-list">
                            ${chaptersHtml}
                        </div>
                    </div>
                    <div style="margin-top: 12px; display: flex; gap: 8px;">
                        <button class="btn btn-primary btn-sm btn-play-all-col" data-col-id="${col.id}" ${(col.items && col.items.length) ? '' : 'disabled'}>
                            <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <polygon points="5 3 19 12 5 21 5 3"></polygon>
                            </svg>
                            Play Sequential Audiobook
                        </button>
                    </div>
                `;
                collectionsContainer.appendChild(card);
            });

            attachCollectionEventListeners();
        } catch (e) {
            collectionsContainer.innerHTML = '<div class="empty-state"><p>Error loading collections.</p></div>';
        }
    }

    function attachCollectionEventListeners() {
        document.querySelectorAll(".btn-delete-col").forEach(btn => {
            btn.addEventListener("click", async () => {
                if (confirm("Delete this audiobook project?")) {
                    await fetch(`/api/collections/${btn.dataset.id}/delete`, { method: "POST" });
                    loadCollections();
                }
            });
        });

        document.querySelectorAll(".btn-del-chapter").forEach(btn => {
            btn.addEventListener("click", async () => {
                await fetch(`/api/collections/item/${btn.dataset.id}/delete`, { method: "POST" });
                loadCollections();
            });
        });

        document.querySelectorAll(".btn-play-chapter").forEach(btn => {
            btn.addEventListener("click", () => {
                playAudioTrack(btn.dataset.url, btn.dataset.title, btn.dataset.col);
            });
        });

        document.querySelectorAll(".btn-play-all-col").forEach(btn => {
            btn.addEventListener("click", () => {
                const colId = parseInt(btn.dataset.colId);
                const col = cachedCollections.find(c => c.id === colId);
                if (!col || !col.items.length) return;

                playlistQueue = col.items.map(it => ({
                    audio_url: it.audio_url,
                    title: it.chapter_title,
                    subtext: `${col.name} • Chapter ${it.order_index}`
                }));
                currentPlaylistIndex = 0;
                playAudioTrack(playlistQueue[0].audio_url, playlistQueue[0].title, playlistQueue[0].subtext);
            });
        });
    }

    // -------------------------------------------------------------------------
    // Modals: Add to Collection & New Collection
    // -------------------------------------------------------------------------
    const modalAddToCollection = document.getElementById("modal-add-to-collection");
    const modalTrackId = document.getElementById("modal-track-id");
    const modalSelectCollection = document.getElementById("modal-select-collection");
    const modalChapterTitle = document.getElementById("modal-chapter-title");
    const btnConfirmAddTrack = document.getElementById("btn-confirm-add-track");
    const btnCloseAddModal = document.getElementById("btn-close-add-modal");
    const btnCancelAddModal = document.getElementById("btn-cancel-add-modal");

    async function openAddToCollectionModal(historyId, title) {
        modalTrackId.value = historyId;
        modalChapterTitle.value = title;

        const res = await fetch("/api/collections");
        const collections = await res.json();

        modalSelectCollection.innerHTML = "";
        if (!collections.length) {
            alert("Please create an Audiobook Project first in the Collections tab.");
            switchTab("tab-collections");
            return;
        }

        collections.forEach(col => {
            const opt = document.createElement("option");
            opt.value = col.id;
            opt.textContent = col.name;
            modalSelectCollection.appendChild(opt);
        });

        modalAddToCollection.classList.add("active");
    }

    function closeAddModal() {
        modalAddToCollection.classList.remove("active");
    }

    btnCloseAddModal.addEventListener("click", closeAddModal);
    btnCancelAddModal.addEventListener("click", closeAddModal);

    btnConfirmAddTrack.addEventListener("click", async () => {
        const colId = modalSelectCollection.value;
        const history_id = modalTrackId.value;
        const chapter_title = modalChapterTitle.value.trim();

        if (!colId) return;

        await fetch(`/api/collections/${colId}/add-item`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ history_id, chapter_title })
        });

        closeAddModal();
        alert("Track added to project successfully!");
    });

    const modalNewCollection = document.getElementById("modal-new-collection");
    const modalNewColName = document.getElementById("modal-new-col-name");
    const modalNewColDesc = document.getElementById("modal-new-col-desc");
    const btnConfirmCreateCol = document.getElementById("btn-confirm-create-collection");
    const btnCloseNewColModal = document.getElementById("btn-close-new-col-modal");
    const btnCancelNewColModal = document.getElementById("btn-cancel-new-col-modal");

    btnNewCollection.addEventListener("click", () => {
        modalNewColName.value = "";
        modalNewColDesc.value = "";
        modalNewCollection.classList.add("active");
    });

    function closeNewColModal() {
        modalNewCollection.classList.remove("active");
    }

    btnCloseNewColModal.addEventListener("click", closeNewColModal);
    btnCancelNewColModal.addEventListener("click", closeNewColModal);

    btnConfirmCreateCol.addEventListener("click", async () => {
        const name = modalNewColName.value.trim();
        const description = modalNewColDesc.value.trim();
        if (!name) {
            alert("Project name is required.");
            return;
        }

        await fetch("/api/collections", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, description })
        });

        closeNewColModal();
        loadCollections();
    });

    // -------------------------------------------------------------------------
    // Privacy Policy Modal
    // -------------------------------------------------------------------------
    const modalPrivacy = document.getElementById("modal-privacy");
    const btnOpenPrivacy = document.getElementById("btn-open-privacy");
    const btnClosePrivacy = document.getElementById("btn-close-privacy");
    const btnDismissPrivacy = document.getElementById("btn-dismiss-privacy");

    if (btnOpenPrivacy && modalPrivacy) {
        btnOpenPrivacy.addEventListener("click", () => {
            modalPrivacy.classList.add("active");
        });
        const closePrivacy = () => modalPrivacy.classList.remove("active");
        if (btnClosePrivacy) btnClosePrivacy.addEventListener("click", closePrivacy);
        if (btnDismissPrivacy) btnDismissPrivacy.addEventListener("click", closePrivacy);
    }

    // -------------------------------------------------------------------------
    // Utilities
    // -------------------------------------------------------------------------
    function escapeHtml(text) {
        if (!text) return "";
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // -------------------------------------------------------------------------
    // Dismiss Skeleton Screen After Setup
    // -------------------------------------------------------------------------
    fetchVoices().then(() => {
        updateTextStats();
        setTimeout(() => {
            const skeleton = document.getElementById("skeleton-overlay");
            if (skeleton) skeleton.classList.add("hidden");
        }, 600);
    });
});
