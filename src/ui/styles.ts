export function getStyles(primaryColor: string): string {
  return `
    :host {
      --ufp-primary: ${primaryColor};
      --ufp-primary-dark: color-mix(in srgb, ${primaryColor} 80%, black);
      --ufp-white: #ffffff;
      --ufp-gray-50: #f9fafb;
      --ufp-gray-100: #f3f4f6;
      --ufp-gray-200: #e5e7eb;
      --ufp-gray-300: #d1d5db;
      --ufp-gray-400: #9ca3af;
      --ufp-gray-500: #6b7280;
      --ufp-gray-600: #4b5563;
      --ufp-gray-700: #374151;
      --ufp-gray-800: #1f2937;
      --ufp-gray-900: #111827;
      --ufp-green: #10b981;
      --ufp-red: #ef4444;
      --ufp-shadow: 0 4px 24px rgba(0,0,0,0.18);
      --ufp-radius: 12px;
      --ufp-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-family: var(--ufp-font);
      all: initial;
    }

    * { box-sizing: border-box; }

    /* Trigger */
    .ufp-trigger {
      position: fixed;
      z-index: 2147483646;
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--ufp-primary);
      color: var(--ufp-white);
      border: none;
      border-radius: 28px;
      padding: 10px 18px 10px 14px;
      cursor: pointer;
      box-shadow: var(--ufp-shadow);
      font-family: var(--ufp-font);
      font-size: 14px;
      font-weight: 600;
      user-select: none;
      transition: background 0.15s, transform 0.1s;
      touch-action: none;
    }
    .ufp-trigger:hover { background: var(--ufp-primary-dark); }
    .ufp-trigger:active { transform: scale(0.97); }
    .ufp-trigger.active { background: var(--ufp-gray-800); }
    .ufp-trigger-icon { width: 20px; height: 20px; flex-shrink: 0; }

    /* Modal overlay */
    .ufp-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.45);
      z-index: 2147483646;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .ufp-modal {
      background: var(--ufp-white);
      border-radius: var(--ufp-radius);
      padding: 28px;
      width: 360px;
      box-shadow: var(--ufp-shadow);
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .ufp-modal h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 700;
      color: var(--ufp-gray-900);
      font-family: var(--ufp-font);
    }
    .ufp-modal p {
      margin: 0;
      font-size: 14px;
      color: var(--ufp-gray-500);
      font-family: var(--ufp-font);
    }

    /* Form elements */
    .ufp-input {
      width: 100%;
      padding: 10px 14px;
      border: 1.5px solid var(--ufp-gray-200);
      border-radius: 8px;
      font-size: 14px;
      font-family: var(--ufp-font);
      color: var(--ufp-gray-900);
      outline: none;
      transition: border-color 0.15s;
    }
    .ufp-input:focus { border-color: var(--ufp-primary); }
    .ufp-textarea {
      width: 100%;
      padding: 10px 14px;
      border: 1.5px solid var(--ufp-gray-200);
      border-radius: 8px;
      font-size: 14px;
      font-family: var(--ufp-font);
      color: var(--ufp-gray-900);
      outline: none;
      resize: vertical;
      min-height: 80px;
      transition: border-color 0.15s;
    }
    .ufp-textarea:focus { border-color: var(--ufp-primary); }

    /* Buttons */
    .ufp-btn {
      padding: 9px 18px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      font-family: var(--ufp-font);
      cursor: pointer;
      border: none;
      transition: background 0.15s, opacity 0.15s;
    }
    .ufp-btn-primary {
      background: var(--ufp-primary);
      color: var(--ufp-white);
    }
    .ufp-btn-primary:hover { background: var(--ufp-primary-dark); }
    .ufp-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .ufp-btn-ghost {
      background: transparent;
      color: var(--ufp-gray-600);
      border: 1.5px solid var(--ufp-gray-200);
    }
    .ufp-btn-ghost:hover { background: var(--ufp-gray-50); }
    .ufp-btn-danger {
      background: var(--ufp-red);
      color: var(--ufp-white);
    }
    .ufp-btn-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      padding: 0;
      border-radius: 6px;
      background: transparent;
      border: none;
      cursor: pointer;
      color: var(--ufp-gray-600);
      font-size: 16px;
      transition: background 0.12s, color 0.12s;
    }
    .ufp-btn-icon:hover { background: var(--ufp-gray-100); color: var(--ufp-gray-900); }
    .ufp-btn-icon.active { background: var(--ufp-primary); color: var(--ufp-white); }

    .ufp-btn-row {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }

    /* Annotation overlay */
    .ufp-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483645;
      cursor: crosshair;
      background: rgba(99,102,241,0.04);
    }
    .ufp-overlay-svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }

    /* Toolbar */
    .ufp-toolbar {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 2147483647;
      background: var(--ufp-white);
      border-radius: 12px;
      box-shadow: var(--ufp-shadow);
      padding: 8px;
      display: flex;
      align-items: center;
      gap: 4px;
      top: 24px;
      left: 50%;
      transform: translateX(-50%);
    }
    .ufp-toolbar-sep {
      width: 1px;
      height: 24px;
      background: var(--ufp-gray-200);
      margin: 0 4px;
    }
    .ufp-toolbar-label {
      font-size: 12px;
      font-family: var(--ufp-font);
      color: var(--ufp-gray-500);
      padding: 0 6px;
    }

    /* Comment input popup */
    .ufp-comment-popup {
      position: fixed;
      z-index: 2147483647;
      background: var(--ufp-white);
      border-radius: var(--ufp-radius);
      box-shadow: var(--ufp-shadow);
      padding: 16px;
      width: 320px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .ufp-comment-popup h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: var(--ufp-gray-800);
      font-family: var(--ufp-font);
    }

    /* Comments panel */
    .ufp-panel {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: 360px;
      z-index: 2147483646;
      background: var(--ufp-white);
      box-shadow: -4px 0 24px rgba(0,0,0,0.12);
      display: flex;
      flex-direction: column;
      transform: translateX(100%);
      transition: transform 0.25s cubic-bezier(0.4,0,0.2,1);
    }
    .ufp-panel.open { transform: translateX(0); }
    .ufp-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid var(--ufp-gray-100);
      flex-shrink: 0;
    }
    .ufp-panel-title {
      font-size: 16px;
      font-weight: 700;
      color: var(--ufp-gray-900);
      font-family: var(--ufp-font);
    }
    .ufp-filter-tabs {
      display: flex;
      gap: 4px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--ufp-gray-100);
      flex-shrink: 0;
    }
    .ufp-filter-tab {
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 13px;
      font-family: var(--ufp-font);
      font-weight: 500;
      cursor: pointer;
      border: none;
      background: transparent;
      color: var(--ufp-gray-500);
      transition: background 0.12s, color 0.12s;
    }
    .ufp-filter-tab.active {
      background: var(--ufp-primary);
      color: var(--ufp-white);
    }
    .ufp-panel-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
    }
    .ufp-panel-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 200px;
      color: var(--ufp-gray-400);
      font-size: 14px;
      font-family: var(--ufp-font);
      gap: 8px;
    }

    /* Comment card */
    .ufp-comment-card {
      padding: 12px 16px;
      border-bottom: 1px solid var(--ufp-gray-100);
      cursor: pointer;
      transition: background 0.12s;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .ufp-comment-card:hover { background: var(--ufp-gray-50); }
    .ufp-comment-card.selected { background: #eef2ff; }
    .ufp-comment-card-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
    }
    .ufp-comment-meta {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .ufp-avatar {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: var(--ufp-primary);
      color: var(--ufp-white);
      font-size: 11px;
      font-weight: 700;
      font-family: var(--ufp-font);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .ufp-comment-author {
      font-size: 13px;
      font-weight: 600;
      color: var(--ufp-gray-800);
      font-family: var(--ufp-font);
    }
    .ufp-comment-time {
      font-size: 11px;
      color: var(--ufp-gray-400);
      font-family: var(--ufp-font);
    }
    .ufp-comment-text {
      font-size: 13px;
      color: var(--ufp-gray-700);
      font-family: var(--ufp-font);
      line-height: 1.5;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .ufp-comment-thumbnail {
      width: 100%;
      height: 80px;
      object-fit: cover;
      object-position: top left;
      border-radius: 6px;
      border: 1px solid var(--ufp-gray-200);
    }
    .ufp-comment-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .ufp-reply-count {
      font-size: 12px;
      color: var(--ufp-gray-400);
      font-family: var(--ufp-font);
    }
    .ufp-resolved-badge {
      font-size: 11px;
      font-weight: 600;
      font-family: var(--ufp-font);
      padding: 2px 8px;
      border-radius: 12px;
      background: #d1fae5;
      color: #065f46;
    }
    .ufp-card-actions {
      display: flex;
      gap: 4px;
    }

    /* Detail view */
    .ufp-detail {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      background: rgba(0,0,0,0.75);
      display: flex;
      align-items: stretch;
    }
    .ufp-detail-image-area {
      flex: 1;
      overflow: auto;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 24px;
      position: relative;
    }
    .ufp-detail-image-wrap {
      position: relative;
      display: inline-block;
    }
    .ufp-detail-screenshot {
      max-width: 100%;
      display: block;
      border-radius: 8px;
    }
    .ufp-detail-annotation-svg {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }
    .ufp-detail-sidebar {
      width: 340px;
      background: var(--ufp-white);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }
    .ufp-detail-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid var(--ufp-gray-100);
      flex-shrink: 0;
    }
    .ufp-detail-body {
      flex: 1;
      overflow-y: auto;
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .ufp-detail-comment {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .ufp-detail-comment-text {
      font-size: 14px;
      color: var(--ufp-gray-800);
      font-family: var(--ufp-font);
      line-height: 1.6;
    }
    .ufp-detail-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    /* Reply thread */
    .ufp-replies {
      display: flex;
      flex-direction: column;
      gap: 12px;
      border-top: 1px solid var(--ufp-gray-100);
      padding-top: 12px;
    }
    .ufp-replies-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--ufp-gray-500);
      font-family: var(--ufp-font);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .ufp-reply {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .ufp-reply-meta {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .ufp-reply-author {
      font-size: 12px;
      font-weight: 600;
      color: var(--ufp-gray-700);
      font-family: var(--ufp-font);
    }
    .ufp-reply-time {
      font-size: 11px;
      color: var(--ufp-gray-400);
      font-family: var(--ufp-font);
    }
    .ufp-reply-text {
      font-size: 13px;
      color: var(--ufp-gray-700);
      font-family: var(--ufp-font);
      line-height: 1.5;
      padding-left: 32px;
    }
    .ufp-reply-input-area {
      display: flex;
      flex-direction: column;
      gap: 8px;
      border-top: 1px solid var(--ufp-gray-100);
      padding-top: 12px;
    }
    .ufp-reply-name-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .ufp-reply-name-label {
      font-size: 12px;
      color: var(--ufp-gray-500);
      font-family: var(--ufp-font);
      white-space: nowrap;
    }

    /* Loading spinner */
    .ufp-spinner {
      width: 20px;
      height: 20px;
      border: 2px solid var(--ufp-gray-200);
      border-top-color: var(--ufp-primary);
      border-radius: 50%;
      animation: ufp-spin 0.7s linear infinite;
    }
    @keyframes ufp-spin { to { transform: rotate(360deg); } }

    /* Scrollbar */
    .ufp-panel-list::-webkit-scrollbar,
    .ufp-detail-body::-webkit-scrollbar,
    .ufp-detail-image-area::-webkit-scrollbar { width: 4px; }
    .ufp-panel-list::-webkit-scrollbar-thumb,
    .ufp-detail-body::-webkit-scrollbar-thumb,
    .ufp-detail-image-area::-webkit-scrollbar-thumb {
      background: var(--ufp-gray-300);
      border-radius: 2px;
    }
  `
}
