// Generated: shared optional update controls; edit the original client templates.
(function(){
/* DSH workbench UI v1. MIT. Canonical source: dsh-suite/ui/workbench-ui.js.
 * Vendored into each plugin: no Suite or extra runtime dependency is required.
 * Styles are scoped to .dshw and never replace the host chrome or theme.
 */
function createWorkbenchUI(React) {
  const h = React.createElement;
  const { useEffect, useId, useRef } = React;
  const cx = (...values) => values.filter(Boolean).join(' ');
  const paths = {
    book: ['M4 4h6a3 3 0 0 1 2 2v15a4 4 0 0 0-4-2H4z', 'M20 4h-6a3 3 0 0 0-2 2v15a4 4 0 0 1 4-2h4z'],
    calendar: ['M5 5h14a2 2 0 0 1 2 2v13H3V7a2 2 0 0 1 2-2Z', 'M7 3v4M17 3v4M3 10h18'],
    mail: ['M3 5h18v14H3z', 'm3 6 9 7 9-7'],
    rss: ['M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16', 'M4 19h.01'],
    slides: ['M3 4h18v13H3z', 'M12 17v4M8 21h8'],
    shield: ['m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6z', 'm8 12 3 3 5-6'],
    layers: ['M5 3h16v16H5z', 'M2 7v15h15'],
    play: ['m9 6 9 6-9 6Z'],
    video: ['M3 5h12v14H3z', 'm15 10 6-4v12l-6-4'],
    search: ['M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z', 'm16 16 5 5'],
    plus: ['M12 5v14M5 12h14'],
    refresh: ['M20 7a9 9 0 1 0 1 8', 'M20 2v5h-5'],
    settings: ['m9 3-.7 2.4-2 .9L4 5.8 2.5 8.4l1.7 1.8v2.3L2.5 14 4 17l2.5-.4 1.9 1L9 20h3l.8-2.4 2-1 2.5.4 1.5-2.7-1.7-1.9v-2.2l1.7-1.8-1.5-2.6-2.5.4-2-1L12 3Z', 'M14 11.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z'],
    close: ['m6 6 12 12M18 6 6 18'],
    left: ['m14 5-7 7 7 7'],
    right: ['m10 5 7 7-7 7'],
    down: ['m5 9 7 7 7-7'],
    filter: ['M4 5h16M7 12h10M10 19h4'],
    download: ['M12 3v12m-5-5 5 5 5-5', 'M4 16v5h16v-5'],
    upload: ['M12 16V4m-5 5 5-5 5 5', 'M4 16v5h16v-5'],
    copy: ['M8 8h13v13H8z', 'M16 8V3H3v13h5'],
    external: ['M14 3h7v7m0-7L10 14', 'M10 3H3v18h18v-7'],
    file: ['M4 3h10l6 6v12H4z', 'M14 3v6h6M8 13h8M8 17h6'],
    folder: ['M3 5h7l2 3h9v12H3z'],
    edit: ['m15 4 5 5-10 10-6 1 1-6Z', 'm13 6 5 5'],
    trash: ['M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7'],
    more: ['M5 12h.01M12 12h.01M19 12h.01'],
    info: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M12 11v6M12 7h.01'],
    check: ['m5 12 4 4L19 6'],
    quote: ['M4 12h6v7H3v-7c0-4 2-6 5-7M15 12h6v7h-7v-7c0-4 2-6 5-7'],
    star: ['m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z'],
    reply: ['m9 5-7 7 7 7v-5h6c3 0 5 2 6 5 0-8-4-11-12-11Z'],
    link: ['m10 13 4-4M8 16l-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0', 'm14 8 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0'],
  };
  function Icon({ name = 'file', size = 20, ...props }) {
    return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false, ...props },
      (paths[name] || paths.file).map((d, index) => h('path', { key: index, d })));
  }
  function Button({ children, icon, variant, className, ...props }) {
    return h('button', { type: 'button', ...props, className: cx('w-button', variant && 'w-' + variant, className) }, icon ? h(Icon, { name: icon, size: 18 }) : null, children);
  }
  function IconButton({ label, icon, ...props }) {
    return h(Button, { ...props, icon, className: cx('w-icon-button', props.className), 'aria-label': label, title: label });
  }
  function Page({ title, subtitle, actions, children, workbench = false, className, rootRef, ...props }) {
    return h('section', { ...props, ref: rootRef, className: cx('dshw', 'w-page', className), 'data-main': workbench ? 'true' : 'false' },
      h(Styles, { key: 'styles' }),
      h('header', { className: 'w-page-header' }, h('div', { className: 'w-heading' }, h('h1', null, title), subtitle ? h('p', { className: 'w-subtitle' }, subtitle) : null), actions ? h('div', { className: 'w-header-actions' }, actions) : null),
      h('div', { className: 'w-body' }, children));
  }
  function Tabs({ items, value, onChange, label, children }) {
    const id = useId();
    const active = items.some(item => item.id === value) ? value : items[0]?.id;
    function keys(event, index) {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
      const node = event.currentTarget.parentElement?.querySelectorAll('[role=tab]')[next];
      if (node) { onChange(items[next].id); node.focus(); }
    }
    return h('div', { className: 'w-tabs-layout' },
      h('div', { className: 'w-tabs', role: 'tablist', 'aria-label': label }, items.map((item, index) => h('button', {
        type: 'button', role: 'tab', key: item.id, id: id + '-' + item.id, 'aria-controls': id + '-panel', 'aria-selected': active === item.id, tabIndex: active === item.id ? 0 : -1,
        onClick: () => onChange(item.id), onKeyDown: event => keys(event, index),
      }, item.label, item.count !== undefined ? h('span', { className: 'w-count' }, item.count) : null))),
      h('div', { className: 'w-tab-panel', id: id + '-panel', role: 'tabpanel', 'aria-labelledby': id + '-' + active }, children));
  }
  function Status({ children, tone = 'info', className }) {
    if (!children) return null;
    return h('div', { className: cx('dshw', 'w-status', 'w-status-' + tone, className), role: tone === 'error' ? 'alert' : 'status', 'aria-live': tone === 'error' ? 'assertive' : 'polite' }, h(Icon, { name: tone === 'success' ? 'check' : 'info', size: 18 }), h('div', null, children));
  }
  function Empty({ title, children, action, icon = 'file' }) {
    return h('div', { className: 'dshw w-empty' }, h(Styles, { key: 'styles' }), h(Icon, { name: icon, size: 32 }), h('h2', null, title), children ? h('div', { className: 'w-muted' }, children) : null, action ? h('div', { className: 'w-toolbar' }, action) : null);
  }
  function Split({ list, detail, selected, onBack, backLabel, className, listWidth = 360 }) {
    const ref = useRef(null);
    useEffect(() => {
      if (!selected || !ref.current || ref.current.clientWidth > 760) return;
      const heading = ref.current.querySelector('.w-detail h2');
      if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
    }, [selected]);
    return h('div', { ref, className: cx('w-split', className), 'data-selected': selected ? 'true' : 'false', style: { '--w-list-width': listWidth + 'px' } },
      h('div', { className: 'w-master' }, list),
      h('div', { className: 'w-detail' }, selected ? h(Button, { className: 'w-back', icon: 'left', variant: 'ghost', onClick: onBack }, backLabel) : null, detail));
  }
  function Row({ title, meta, description, active, onClick, children, status, className, disabled }) {
    return h('div', { className: cx('w-row', active && 'w-selected', className) },
      children ? h('div', { className: 'w-row-select' }, children) : null,
      h('button', { type: 'button', className: 'w-row-button', onClick, disabled, 'aria-pressed': !!active },
        h('span', { className: 'w-row-head' }, h('strong', null, title), status ? h('span', { className: 'w-tag' }, status) : null),
        meta ? h('span', { className: 'w-row-meta' }, meta) : null,
        description ? h('span', { className: 'w-row-description' }, description) : null));
  }
  function Search({ label, value, onChange, ...props }) {
    const id = useId();
    return h('div', { className: 'w-search' }, h(Icon, { name: 'search', size: 18 }), h('input', { type: 'search', id, 'aria-label': label, placeholder: label, value, onChange, ...props }));
  }
  function Switch({ label, checked, onChange, disabled }) {
    return h('label', { className: 'w-switch-label' }, h('span', null, label), h('input', { type: 'checkbox', role: 'switch', checked, disabled, onChange, 'aria-label': label }), h('span', { className: 'w-switch-track', 'aria-hidden': true }));
  }
  function Dialog({ title, children, onClose, closeLabel, className, busy = false }) {
    const id = useId(), panel = useRef(null);
    useEffect(() => {
      const previous = document.activeElement;
      panel.current?.querySelector('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')?.focus();
      return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
    }, []);
    function keydown(event) {
      if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); event.stopPropagation(); if (!busy) onClose(); return; }
      if (event.key !== 'Tab') return;
      const controls = [...panel.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')].filter(node => node.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (!controls.length) { event.preventDefault(); panel.current.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    return h('div', { className: 'dshw w-overlay', onClick: event => { if (!busy && event.target === event.currentTarget) onClose(); } },
      h(Styles, { key: 'styles' }),
      h('section', { ref: panel, className: cx('w-dialog', className), role: 'dialog', 'aria-modal': true, 'aria-labelledby': id, tabIndex: -1, onKeyDown: keydown },
        h('header', { className: 'w-dialog-header' }, h('h2', { id }, title), h(IconButton, { icon: 'close', label: closeLabel, disabled: busy, onClick: onClose })), h('div', { className: 'w-dialog-body' }, children)));
  }
  function register(ctx, { id, label, icon, component, inject, order = 50 }) {
    // The two slots are optional. Existing settings and manual tools still load
    // in hosts without a workbench, while RC.3 owns navigation/pinning itself.
    ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: id, inject: () => ({ ...(inject?.() || {}), workbench: true }) }, component));
    ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id, order, label }, function WorkbenchIcon({ size }) { return h(Icon, { name: icon, size }); }));
  }
  const styles = `
.dshw{--w-bg:var(--dsw-alias-bg-layer-1,#fff);--w-soft:var(--dsw-alias-bg-layer-2,#f7f8fa);--w-text:var(--dsw-alias-label-primary,#18202c);--w-muted:var(--dsw-alias-label-secondary,#667085);--w-border:var(--dsw-alias-border-l3,#e7e9ef);--w-accent:var(--dsh-plugin-workbench-accent,#4f6bdb);--w-selected:color-mix(in srgb,var(--w-accent) 10%,var(--w-bg));--w-primary:var(--w-text);--w-on-primary:var(--w-bg);container-type:inline-size;container-name:dsh-workbench;color:var(--w-text);font:14px/1.65 var(--dsh-font-family-content,system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif);min-width:0;max-width:100%;box-sizing:border-box;text-align:start;color-scheme:inherit}
.dshw *,.dshw *:before,.dshw *:after{box-sizing:border-box}.dshw h1,.dshw h2,.dshw h3,.dshw h4,.dshw p{margin:0}.dshw h1{font-size:30px;line-height:1.25;letter-spacing:-.025em;font-weight:650}.dshw h2{font-size:24px;line-height:1.35;font-weight:650;letter-spacing:-.015em;overflow-wrap:anywhere}.dshw h3,.dshw h4{font-size:16px;line-height:1.4;font-weight:600}.dshw a{color:var(--w-accent);text-underline-offset:3px;overflow-wrap:anywhere}.dshw button,.dshw input,.dshw select,.dshw textarea{font:inherit;color:inherit;max-width:100%}.dshw input:not([type=checkbox]):not([type=radio]):not([type=file]),.dshw select,.dshw textarea{background:var(--dsw-specific-input-major,var(--w-bg));border:1px solid var(--w-border);border-radius:8px;padding:8px 11px;min-width:0;line-height:1.5}.dshw input:not([type=checkbox]):not([type=radio]):not([type=file]),.dshw select{min-height:38px}.dshw textarea{resize:vertical}.dshw input[type=checkbox],.dshw input[type=radio]{width:16px;height:16px;flex-shrink:0;accent-color:var(--w-accent)}.dshw :focus-visible{outline:2px solid var(--w-accent);outline-offset:3px}.dshw button:disabled,.dshw input:disabled,.dshw select:disabled,.dshw textarea:disabled{opacity:.5;cursor:not-allowed}.dshw label{font-size:13px}.dshw fieldset{min-width:0;border:1px solid var(--w-border);border-radius:8px}.dshw summary{cursor:pointer;font-weight:550;list-style:none;display:flex;align-items:center;gap:8px}.dshw summary::-webkit-details-marker{display:none}.dshw summary:after{content:'';display:block;margin-inline-start:auto;width:7px;height:7px;border-inline-end:1.75px solid currentColor;border-bottom:1.75px solid currentColor;transform:rotate(45deg);flex-shrink:0}.dshw details[open]>summary:after{transform:rotate(225deg)}.dshw details>summary+*{margin-top:12px}.dshw pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.7 ui-monospace,SFMono-Regular,Consolas,monospace;max-width:100%;background:var(--w-soft);border-radius:6px;padding:14px}.dshw img,.dshw video,.dshw iframe{max-width:100%}
.w-page{display:flex;flex-direction:column;position:relative;padding:0;min-height:540px;gap:0}.w-page[data-main=true]{height:100%;min-height:0;padding:calc(24px + var(--dsh-frame-top-clearance,0px)) 28px 0 max(28px,var(--dsh-frame-leading-clearance,0px));overflow:auto}.dshw[data-main=true]{background:var(--w-bg)}.dshw.w-page,.dshw .w-body,.dshw .w-tab-panel{overflow-x:clip}.w-page-header{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;padding-bottom:22px;flex-shrink:0}.w-heading{min-width:0}.w-subtitle{margin-top:8px!important;font-size:14px;color:var(--w-muted);line-height:1.6}.w-header-actions,.w-toolbar,.w-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px;min-width:0}.w-header-actions{justify-content:flex-end}.w-body,.w-tabs-layout{display:flex;flex-direction:column;flex:1;min-height:0;min-width:0}.w-body{overflow:auto}.w-tab-panel{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;overflow:auto}.w-tabs{display:flex;align-items:stretch;gap:20px;border-bottom:1px solid var(--w-border);flex-shrink:0;overflow-x:auto;scrollbar-width:thin}.dshw .w-tabs>button{border:0;border-bottom:2px solid transparent;background:transparent;padding:11px 8px 13px;white-space:nowrap;font-size:14px;font-weight:550;cursor:pointer;color:var(--w-muted);display:flex;align-items:center;gap:7px}.dshw .w-tabs>button[aria-selected=true]{border-bottom-color:var(--w-accent);color:var(--w-accent)}.w-count,.w-tag{font-size:12px;line-height:1.5;display:inline-flex;align-items:center;flex-shrink:0;background:var(--w-soft);border-radius:5px;padding:1px 6px;color:var(--w-muted)}.w-tabs [aria-selected=true] .w-count,.w-selected .w-tag{color:var(--w-accent);background:var(--w-selected)}
.dshw .w-button{display:inline-flex;justify-content:center;align-items:center;gap:7px;background:var(--w-bg);border:1px solid var(--w-border);border-radius:8px;padding:8px 12px;min-height:36px;line-height:1.4;font-size:14px;font-weight:500;cursor:pointer;text-decoration:none;white-space:normal}.dshw .w-button:not(:disabled):hover{background:var(--w-soft)}.dshw .w-primary{background:var(--w-primary);border-color:var(--w-primary);color:var(--w-on-primary)}.dshw .w-primary:not(:disabled):hover{background:var(--w-primary);opacity:.9}.dshw .w-ghost{background:transparent;border-color:transparent}.dshw .w-danger{color:var(--dsw-alias-state-error-primary,#b43c3c)}.dshw .w-icon-button{width:36px;min-width:36px;padding:8px}.dshw .w-button svg{flex-shrink:0}.w-muted{color:var(--w-muted);font-size:12px;line-height:1.6}.w-section{padding:24px 0;border-bottom:1px solid var(--w-border);min-width:0}.w-section>h3{margin-bottom:12px}.w-section>p+p{margin-top:8px}.w-fields{display:grid;gap:16px;min-width:0}.w-field{display:grid;gap:6px;min-width:0}.w-field>input,.w-field>select,.w-field>textarea{width:100%}.w-status{display:flex;align-items:flex-start;gap:8px;padding:11px 13px;margin:12px 0;border:1px solid var(--w-border);border-radius:8px;background:var(--w-soft);font-size:13px;overflow-wrap:anywhere;flex-shrink:0}.w-status>svg{flex-shrink:0;margin-top:2px}.w-status-error{color:var(--dsw-alias-state-error-primary,#ad3636)}.w-status-success{color:var(--dsw-alias-state-success-primary,#24794a)}.w-status-warn{color:var(--dsw-alias-state-warning-primary,#8a5a00)}.w-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:14px;width:100%;max-width:580px;padding:48px 24px;margin:auto;min-height:280px;overflow-wrap:anywhere}.w-empty>svg{color:var(--w-muted)}.w-empty h2{font-size:20px}.w-empty .w-muted{font-size:14px}.w-empty .w-toolbar{justify-content:center}
.w-split{display:grid;grid-template-columns:minmax(240px,var(--w-list-width)) minmax(0,1fr);min-height:460px;flex:1;min-width:0}.w-master{min-width:0;border-inline-end:1px solid var(--w-border);overflow:auto;padding-bottom:24px}.w-detail{min-width:0;padding:26px 28px;overflow:auto;overflow-wrap:anywhere;display:flex;flex-direction:column}.w-master-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:20px 16px}.w-search{display:flex;align-items:center;gap:8px;border:1px solid var(--w-border);border-radius:8px;padding:0 10px;min-width:0;flex:1;background:var(--w-bg)}.w-search>svg{color:var(--w-muted);flex-shrink:0}.dshw .w-search>input{border:0!important;background:transparent!important;padding:8px 0!important;width:100%;outline-offset:0}.w-row{display:flex;gap:0;min-width:0;position:relative;border-bottom:1px solid var(--w-border);border-inline-start:3px solid transparent}.w-row-select{display:flex;align-items:flex-start;padding:21px 0 0 14px}.dshw .w-row-button{display:flex;flex-direction:column;align-items:stretch;gap:7px;text-align:start;width:100%;padding:18px 18px 18px 16px;border:0;background:transparent;color:inherit;min-width:0;cursor:pointer;line-height:1.5}.dshw .w-row-button:hover{background:var(--w-soft)}.w-row-head{display:flex;align-items:flex-start;gap:10px;justify-content:space-between;min-width:0}.w-row-head>strong{font-size:14px;line-height:1.5;font-weight:600;overflow-wrap:anywhere}.w-row-meta,.w-row-description{color:var(--w-muted);font-size:12px;line-height:1.6;overflow-wrap:anywhere}.w-row-description{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.w-selected{background:var(--w-selected);border-inline-start-color:var(--w-accent)}.w-back{display:none!important}.w-detail-title{margin-bottom:12px!important}.w-detail-meta{color:var(--w-muted);font-size:13px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.w-detail-footer{padding:24px 0;display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:auto;border-top:1px solid var(--w-border)}.w-detail-footer .w-muted{flex:1;min-width:160px}.w-definition{display:grid;grid-template-columns:minmax(80px,120px) minmax(0,1fr);gap:8px 16px;font-size:14px;margin:20px 0}.w-definition dt{color:var(--w-muted)}.w-definition dd{margin:0;min-width:0;overflow-wrap:anywhere}
.w-switch-label{display:inline-flex;align-items:center;gap:8px;font-size:13px;position:relative;cursor:pointer}.w-switch-label>input{position:absolute;opacity:0;inset-inline-end:0;width:36px!important;height:22px!important;margin:0;cursor:pointer}.w-switch-track{width:36px;height:22px;border-radius:12px;display:block;background:var(--w-border);border:1px solid var(--w-border);pointer-events:none;padding:2px;transition:background .15s}.w-switch-track:before{content:'';display:block;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px #0002;transition:transform .15s}.w-switch-label>input:checked+.w-switch-track{background:var(--w-accent);border-color:var(--w-accent)}.w-switch-label>input:checked+.w-switch-track:before{transform:translateX(14px)}.w-switch-label>input:focus-visible+.w-switch-track{outline:2px solid var(--w-accent);outline-offset:3px}.w-switch-label:has(>input:disabled){opacity:.5;cursor:not-allowed}
.w-overlay{position:fixed;inset:0;background:#0005;display:flex;justify-content:flex-end;z-index:1000;padding:12px;overflow:auto}.w-dialog{width:min(620px,100%);max-height:100%;display:flex;flex-direction:column;min-height:0;background:var(--w-bg);color:var(--w-text);border:1px solid var(--w-border);border-radius:12px;box-shadow:0 18px 70px #0003}.w-dialog-header{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:20px 24px;border-bottom:1px solid var(--w-border);flex-shrink:0}.w-dialog-header>h2{font-size:20px}.w-dialog-body{overflow:auto;padding:20px 24px;min-height:0}.w-editor-grid{display:grid;grid-template-columns:210px minmax(0,1fr) 300px;min-height:500px;flex:1}.w-editor-list{padding:20px 12px;border-inline-end:1px solid var(--w-border);min-width:0}.w-editor-canvas{background:var(--w-soft);padding:20px;min-width:0;display:flex;flex-direction:column;gap:14px}.w-editor-inspector{padding:24px;border-inline-start:1px solid var(--w-border);min-width:0;overflow:auto}.w-editor-inspector h3{margin-bottom:18px}.w-preview-empty{display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:12px;aspect-ratio:16/9;min-height:180px;background:var(--w-soft);border:1px solid var(--w-border);border-radius:8px;padding:24px;color:var(--w-muted)}.w-content-pad{padding:24px 0}.w-stack{display:flex;flex-direction:column;gap:16px;min-width:0}.w-scroll-x{overflow:auto;max-width:100%}
@container dsh-workbench (max-width:1000px){.w-editor-grid{grid-template-columns:160px minmax(0,1fr)}.w-editor-inspector{grid-column:1/-1;border-inline-start:0;border-top:1px solid var(--w-border)}.w-header-actions{max-width:60%}.w-split{grid-template-columns:minmax(240px,32%) minmax(0,1fr)}}
@container dsh-workbench (max-width:760px){.w-page-header{gap:14px;flex-wrap:wrap;padding-bottom:18px}.w-heading{flex:1;min-width:170px}.dshw h1{font-size:24px}.w-header-actions{max-width:100%;justify-content:flex-start}.w-subtitle{font-size:13px}.w-tabs{gap:12px}.dshw .w-tabs>button{padding:10px 4px 12px}.w-split{display:block;min-height:360px}.w-split[data-selected=false]>.w-detail{display:none}.w-split[data-selected=true]>.w-master{display:none}.w-master{border-inline-end:0}.w-detail{padding:20px 0}.w-back{display:inline-flex!important;align-self:flex-start;margin:0 0 16px!important}.w-detail h2{font-size:22px}.w-master-toolbar{padding:16px 0}.dshw .w-row-button{padding:16px 10px}.w-detail-footer{position:static}.w-detail-footer .w-muted{flex-basis:100%}.w-editor-grid{display:flex;flex-direction:column}.w-editor-list{border-inline-end:0;border-bottom:1px solid var(--w-border);padding:16px 0}.w-editor-canvas{padding:16px 0;background:var(--w-bg)}.w-editor-inspector{padding:20px 0}.w-dialog-header,.w-dialog-body{padding:16px}.w-button{min-height:40px}.w-definition{grid-template-columns:80px minmax(0,1fr)}}
@media(max-width:700px){.w-page[data-main=true]{padding:calc(16px + var(--dsh-frame-top-clearance,0px)) 16px 0 max(16px,var(--dsh-frame-leading-clearance,0px))}.w-overlay{padding:8px}.w-dialog{width:100%}}
@media(prefers-reduced-motion:reduce){.dshw *,.dshw *:before{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
`;
  function Styles() { return h('style', null, styles); }
  return { Icon, Button, IconButton, Page, Tabs, Status, Empty, Split, Row, Search, Switch, Dialog, Styles, register, styles };
}

/* One update control per plugin. Only transport, idle guards and installation
 * coordination are shared; no global update page or update-all action exists. */
function __stardustUpdatesGuards() {
  const key = Symbol.for('stardustlc.plugin-updates.guards.v1');
  return globalThis[key] ||= { values: new Map(), listeners: new Set(), viewListeners: new Set(), clients: new Set() };
}
function __stardustUpdatesGuard(React, name, { dirty = false, busy = false, retainOnClose = false } = {}) {
  const token = React.useRef(null);
  if (!token.current) token.current = {};
  React.useLayoutEffect(() => {
    const pool = __stardustUpdatesGuards();
    if (!dirty && !busy) for (const [key, value] of pool.values) if (value.name === name && value.orphan) pool.values.delete(key);
    pool.values.set(token.current, { name, dirty: !!dirty, busy: !!busy, retainOnClose, orphan: false });
    for (const listener of pool.listeners) listener();
  }, [name, !!dirty, !!busy, retainOnClose]);
  React.useEffect(() => () => {
    const pool = __stardustUpdatesGuards(), value = pool.values.get(token.current);
    if (value?.retainOnClose && (value.dirty || value.busy)) value.orphan = true;
    else pool.values.delete(token.current);
    for (const listener of pool.listeners) listener();
  }, []);
}
function __StardustPluginUpdatesFooter({ React, name }) {
  const [, render] = React.useState(0), pool = __stardustUpdatesGuards();
  React.useEffect(() => { const fn = () => render(value => value + 1); pool.viewListeners.add(fn); return () => pool.viewListeners.delete(fn); }, []);
  const client = [...pool.clients].find(client => typeof client.Footer === 'function' && client.has(name));
  if (!client) return null;
  return React.createElement(client.Footer, { name });
}
function __stardustUpdatesInlinePage(React, element, name) {
  return React.cloneElement(element, null, element.props.children, React.createElement(__StardustPluginUpdatesFooter, { key: 'plugin-updates', React, name }));
}
function __stardustUpdatesDetailName(subject, rows) {
  if (!subject || !['bundle', 'row'].includes(subject.kind)) return null;
  if (subject.kind === 'row' && subject.pkg?.name === '@stardustlc/dsh-suite') {
    const component = rows.find(row => row.bundledBy === subject.pkg.name && (subject.row?.moduleName === row.name || subject.row?.moduleName?.startsWith(row.name + '/')));
    if (component) return component.name;
  }
  return rows.some(row => row.name === subject.pkg?.name) ? subject.pkg.name : null;
}
function __stardustUpdatesNativeFormState(document) {
  let dirty = false, busy = false;
  for (const scope of document.querySelectorAll('[data-plugin-detail],[data-plugin-row-detail]')) for (const button of scope.querySelectorAll('button')) {
    if (!button.getClientRects().length || button.closest('.plugin-updates-footer')) continue;
    const label = (button.getAttribute('aria-label') || button.textContent || '').trim();
    if (/^(?:正在保存|保存中|Saving)(?:[.…\s]|$)/i.test(label) || button.getAttribute('aria-busy') === 'true') busy = true;
    if (!button.disabled && button.getAttribute('aria-disabled') !== 'true' && /^(?:保存(?:更改|设置|配置)?|Save(?: changes| settings| configuration)?)(?:\s+(?:Ctrl|⌘|Enter|↵).*)?$/i.test(label)) dirty = true;
  }
  return { dirty, busy };
}
function __stardustUpdatesDisplayRows(next, known) {
  for (const row of next.rows) known.set(row.name, row);
  if (!['verifying', 'installing', 'cancelling', 'unknown', 'restore-failed'].includes(next.job?.state)) return next;
  const rows = [...next.rows];
  for (const row of known.values()) if ((row.name === next.job.name || row.bundledBy === next.job.name) && !rows.some(item => item.name === row.name)) rows.push({ ...row, updating: true });
  return { ...next, rows };
}
function __stardustUpdatesSuiteRows(next, participants) {
  // The official manager lists top-level dependencies, not Suite's transitive
  // components. Project active, build-identified clients for display only.
  // Installation and preferences still use the real Suite row from the host.
  const suite = next.rows.find(row => row.name === '@stardustlc/dsh-suite' && row.enabled);
  if (!suite) return next;
  const rows = [...next.rows], names = new Set(rows.map(row => row.name));
  for (const item of participants) if (item.suiteComponent && item.packageVersion && item.label && !names.has(item.name)) {
    names.add(item.name);
    rows.push({ name: item.name, version: item.packageVersion, enabled: true, sourceKind: 'suite', loadError: false, label: item.label, labelEn: item.labelEn, bundledBy: suite.name });
  }
  return { ...next, rows };
}
function __stardustUpdatesWrap(definition, participant) {
  return { ...definition, factory(require) {
    const original = definition.factory(require);
    if (!original || typeof original !== 'object') return original;
    const React = require('react');
    return { ...original, apply(ctx, ...args) {
      const result = original.apply?.call(this, ctx, ...args);
      // The optional alpha.3 slot stays dormant in older hosts; its scoped
      // injection unregisters naturally when the plugin is unloaded.
      if (participant.iconData && participant.sectionIds?.length && typeof ctx.inject === 'function') ctx.inject(['slots'], host => {
        for (const id of new Set(participant.sectionIds)) host.slots.inject('settings.section.icon', () => host.slots.register({ name: 'settings.section.icon', id }, function PluginSettingsIcon({ size = 20 }) {
          return React.createElement('img', { src: participant.iconData, alt: '', 'aria-hidden': true, width: size, height: size, style: { objectFit: 'contain', display: 'block', flexShrink: 0 } });
        }));
      });
      if (typeof ctx.inject === 'function') ctx.inject(['slots', 'locale', 'remote', 'remote.pluginManager'], host => __stardustUpdatesJoin(host, React, require, participant));
      return result;
    } };
  } };
}
function __stardustUpdatesJoin(host, React, require, participant) {
  const key = Symbol.for('stardustlc.plugin-updates.client.v1'), pools = globalThis[key] ||= new WeakMap(), root = host.root || host;
  if (typeof root.plugin !== 'function') return;
  let record = pools.get(root);
  if (!record) {
    record = { refs: new Map(), timer: null, version: participant.version, alive: true, hold: false, uiRevision: 2 };
    pools.set(root, record);
    __stardustUpdatesActivate(record, pools, root, React, require);
  } else if (record.uiRevision !== 2 && !record.migration) {
    // The first loaded participant may still own a pre-footer client. Keep
    // its references and draft guards, wait for any admitted install, then
    // replace that one client fiber instead of running two window heartbeats.
    const shared = record;
    record.migration = Promise.resolve().then(async () => {
      while (shared.alive && shared.hold) await new Promise(resolve => setTimeout(resolve, 500));
      if (!shared.alive || !shared.refs.size) return;
      await shared.fiber?.dispose?.();
      if (!shared.refs.size) return;
      shared.alive = true; shared.uiRevision = 2; pools.set(root, shared);
      __stardustUpdatesActivate(shared, pools, root, React, require);
    }).catch(() => { /* The original page remains usable if host disposal fails. */ });
  }
  clearTimeout(record.timer);
  const ref = {}; record.refs.set(ref, participant);
  host.effect(() => () => {
    record.refs.delete(ref);
    const stop = () => {
      if (record.refs.size || !record.alive) return;
      if (record.hold) { record.timer = setTimeout(stop, 1000); return; }
      record.alive = false; Promise.resolve(record.fiber?.dispose?.()).catch(() => {});
    };
    if (!record.refs.size) record.timer = setTimeout(stop, 1000);
  });
}
function __stardustUpdatesActivate(shared, pools, root, React, require) {
  shared.fiber = root.plugin({ name: 'stardustlc-plugin-updates-client', inject: ['slots', 'locale', 'remote', 'remote.pluginManager'], apply(ctx) {
    const client = __stardustUpdatesClient(ctx, React, require, shared);
    ctx.effect(() => () => { shared.alive = false; client.dispose(); if (pools.get(root) === shared) pools.delete(root); });
  } });
  Promise.resolve(shared.fiber).catch(() => { shared.alive = false; if (pools.get(root) === shared) pools.delete(root); });
}
function __stardustUpdatesClient(ctx, React, require, shared) {
  const h = React.createElement, W = createWorkbenchUI(React), route = new URL('api/stardustlc/plugin-updates', document.baseURI);
  const { useState, useEffect } = React, id = crypto.randomUUID(), listeners = new Set(), pool = __stardustUpdatesGuards(), requests = new Set(), notified = new Set(), knownRows = new Map();
  let alive = true, registered = false, state = null, lastInteraction = Date.now(), inPoll = false, manualOperation = false, legacyHint = null;
  const language = () => String(ctx.locale?.getSnapshot?.().active || '').startsWith('en') ? 'en' : 'zh';
  const t = (zh, en) => language() === 'en' ? en : zh;
  const preferences = name => state?.preferences.packages[name] || { checkEnabled: true, autoInstall: false, deferredUntil: 0, ignoredVersion: null };
  const originalRow = name => state?.rows.find(row => row.name === name);
  const rowFor = name => { const row = originalRow(name); return row?.bundledBy ? originalRow(row.bundledBy) : row; };
  const activeJob = () => ['verifying', 'installing', 'cancelling'].includes(state?.job?.state);
  function notify() { shared.hold = manualOperation || activeJob(); for (const listener of listeners) listener(); for (const listener of pool.viewListeners) listener(); }
  async function api(body = { action: 'state' }) {
    const controller = new AbortController(); requests.add(controller);
    const timeout = setTimeout(() => controller.abort(), body.action === 'check' ? 95000 : 45000);
    try {
      const response = await fetch(route, { method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal, headers: { 'content-type': 'application/json', 'x-stardustlc-updates': '1' }, body: JSON.stringify(body) });
      let data; try { data = await response.json(); } catch { throw new Error('service-unavailable'); }
      if (!response.ok || !data.ok) throw new Error(response.status === 403 ? 'owner-required' : data.code || 'service-unavailable');
      return data.value;
    } catch (error) { if (error?.name === 'AbortError') throw new Error('service-unavailable'); throw error; }
    finally { clearTimeout(timeout); requests.delete(controller); }
  }
  function pageState(manual = manualOperation) {
    const values = [...pool.values.values()], nativeForm = __stardustUpdatesNativeFormState(document);
    const dialog = [...document.querySelectorAll('[role="dialog"],dialog[open]')].some(node => node.getClientRects().length && !(manual && (node.closest('.plugin-updates-footer') || node.querySelector('.plugin-updates-footer'))));
    return { action: 'heartbeat', id, dirty: nativeForm.dirty || values.some(value => value.dirty), busy: nativeForm.busy || values.some(value => value.busy) || dialog, idleForMs: Math.min(86400000, Math.max(0, Date.now() - lastInteraction)) };
  }
  const heartbeat = () => api(pageState());
  function interaction() { lastInteraction = Date.now(); if (registered && alive) void heartbeat().catch(() => {}); }
  const guardChanged = () => { if (registered && alive) void heartbeat().catch(() => {}); };
  for (const event of ['pointerdown', 'keydown', 'input']) document.addEventListener(event, interaction, { capture: true, passive: true });
  pool.listeners.add(guardChanged);
  const close = () => { void fetch(route, { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'content-type': 'application/json', 'x-stardustlc-updates': '1' }, body: JSON.stringify({ action: 'client-close', id }) }).catch(() => {}); };
  window.addEventListener('pagehide', close);
  async function refresh() { const next = await api(); if (alive) { state = __stardustUpdatesDisplayRows(__stardustUpdatesSuiteRows(next, shared.refs.values()), knownRows); notify(); } return next; }
  function useSnapshot() {
    const [, render] = useState(0);
    useEffect(() => { const fn = () => render(value => value + 1); listeners.add(fn); const stop = ctx.locale?.subscribe?.(fn); return () => { listeners.delete(fn); stop?.(); }; }, []);
    return state;
  }
  function message(code) {
    return ({
      'page-dirty': t('有未保存的修改。请先保存或放弃修改，再更新。', 'Save or discard unsaved changes before updating.'),
      'page-busy': t('有页面操作或对话框尚未结束，请完成后再试。', 'Finish the active page operation or close its dialog, then retry.'),
      'page-not-ready': t('还有窗口状态未确认，或旧版插件尚未提供状态保护。请刷新相关窗口，必要时先手动更新旧版插件。', 'A window state is unknown or an older plugin lacks state protection. Refresh the affected windows and manually update legacy plugins if needed.'),
      busy: t('DSH 正在执行任务或安装，请等操作结束。', 'DSH is running a task or installation. Wait for it to finish.'),
      'activity-unknown': t('无法确认任务是否空闲，已暂停安装。', 'Installation paused because task activity is unknown.'),
      'restart-required': t('更新服务需要重启后继续。请在方便时手动重启 DSH。', 'The updater needs a restart. Restart DSH manually when convenient.'),
      'operation-unconfirmed': t('上次安装未确认或恢复失败。请在官方插件管理中检查并修复，之后手动重启 DSH。', 'The last installation is unconfirmed or recovery failed. Check and repair it in native plugin management, then restart DSH manually.'),
      'check-first': t('检查结果已过期，请重新检查。', 'This check expired. Check again.'),
      'release-changed': t('发布信息已变化，本次未安装。请重新检查。', 'Release metadata changed. Nothing was installed; check again.'),
      'preferences-conflict': t('另一个窗口修改了偏好，已刷新，请重试。', 'Preferences changed in another window. They have been refreshed; retry.'),
      'preferences-unreadable': t('更新偏好文件无法读取，自动安装已关闭。请检查当前 profile 的 stardustlc-plugin-updates.json。', 'Preferences could not be read. Automatic installation is off. Check stardustlc-plugin-updates.json in this profile.'),
      'no-update': t('版本已变化或暂不兼容，请重新检查。', 'The version changed or is incompatible. Check again.'),
      'source-not-registry': t('本地源码、Git 等安装，请通过原安装方式更新。', 'Update local, Git and other external sources through their original installation method.'),
      'managed-by-suite': t('这个插件随 Suite 安装，通过 Suite 更新。', 'This plugin was installed through Suite and is updated through Suite.'),
      'owner-required': t('只有 profile 拥有者能管理更新。', 'Only the profile owner can manage updates.'),
    })[code] || t('操作未完成，请刷新后重试。DSH 不会因此自动重启。', 'The operation could not be completed. Refresh and retry. DSH will not restart automatically.');
  }
  // releaseOf() keeps the failing engine/peer range check as a stable code; say which
  // environment has to change instead of only reporting that the release is incompatible.
  function requirement(release) {
    return ({
      'dsh-version': t('需要换成与该版本匹配的 DSH 本体', 'it needs a different DSH version'),
      'node-version': t('需要换成与该版本匹配的 Node.js', 'it needs a different Node.js version'),
      deprecated: t('作者已把这个版本标记为弃用', 'the author marked this release as deprecated'),
      'not-bundle': t('这个版本不是可加载的 DSH 插件包', 'this release is not a loadable DSH plugin bundle'),
    })[release?.reason] || t('发布元数据的兼容范围与当前环境不符', 'its published compatibility range does not match this environment');
  }
  function jobLabel(job) {
    return ({ verifying: t('正在核对版本', 'Verifying release'), installing: t('正在安装', 'Installing'), cancelling: t('正在请求取消', 'Requesting cancellation'), complete: t('已更新', 'Updated'), 'restart-required': t('已安装，等待你手动重启', 'Installed; manual restart needed'), restored: t('更新未成功，已恢复原版本', 'Update failed; previous version restored'), 'restore-failed': t('恢复未成功，请检查官方插件管理', 'Recovery failed; check native plugin management'), unknown: t('结果未确认，请检查官方插件管理', 'Result unconfirmed; check native plugin management'), cancelled: t('已取消', 'Cancelled'), failed: t('更新未成功', 'Update failed') })[job.state] || job.state;
  }
  function FooterFrame({ name, label, subtitle, actions, children }) {
    return h('section', { className: 'dshw plugin-updates-footer', 'data-plugin-update-footer': name, 'aria-label': label + t(' · 版本与更新', ' · Version and updates') },
      h('style', null, W.styles),
      h('style', null, '.plugin-updates-footer{box-sizing:border-box;flex-shrink:0;margin-top:28px;padding-top:18px;border-top:1px solid var(--dsw-alias-border-l3,#e5e7eb);min-width:0;max-width:100%;color:var(--dsw-alias-label-primary,#202124)}.plugin-updates-footer .updates-head{display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px}.plugin-updates-footer h2{font-size:14px;line-height:22px;margin:0;font-weight:600}.plugin-updates-footer .updates-subtitle,.plugin-updates-footer .updates-version{font:12px/1.6 ui-monospace,monospace;overflow-wrap:anywhere;margin:4px 0}.plugin-updates-footer .updates-options{margin-top:12px}.plugin-updates-footer .updates-options>summary{cursor:pointer;font-size:12px;line-height:22px;color:var(--dsw-alias-label-secondary,#657080)}.plugin-updates-footer .updates-options>summary:focus-visible{outline:2px solid var(--dsw-focus-ring-color,#6b79df);outline-offset:4px}.plugin-updates-footer .updates-settings{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:16px;padding:14px 0 0}.plugin-updates-footer .updates-note{margin:5px 0 0;font-size:12px;line-height:1.6}.plugin-updates-footer>.w-section{margin:10px 0 0;padding:0;border:0}.plugin-updates-footer .w-toolbar{margin-top:10px!important}.plugin-updates-footer .w-switch-label{max-width:100%;gap:12px;align-items:flex-start}.plugin-updates-footer .w-switch-track{flex-shrink:0}.plugin-updates-footer .updates-notes{margin-top:12px;padding:12px;border:1px solid var(--dsw-alias-border-l3,#e5e7eb);border-radius:10px}.plugin-updates-footer .updates-notes pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto;font:12px/1.7 ui-monospace,monospace}.plugin-updates-footer .w-overlay{z-index:1002}@media(max-width:600px){.plugin-updates-footer .updates-head{gap:8px}.plugin-updates-footer .w-toolbar{gap:6px;flex-wrap:wrap}.plugin-updates-footer .w-button{max-width:100%}}'),
      h('div', { className: 'updates-head' }, h('div', null, h('h2', null, t('版本与更新', 'Version and updates')), h('p', { className: 'updates-subtitle w-muted' }, subtitle)), actions), children);
  }
  function Panel({ name }) {
    const snapshot = useSnapshot(), [error, setError] = useState(''), [working, setWorking] = useState(false), [checking, setChecking] = useState(false), [dialog, setDialog] = useState(null), [notes, setNotes] = useState(null), [notesOpen, setNotesOpen] = useState(false), [loadingNotes, setLoadingNotes] = useState(false);
    const row = rowFor(name), original = originalRow(name), target = row?.name || name, prefs = preferences(target), job = snapshot?.job?.name === target ? snapshot.job : null;
    async function perform(callback) { setError(''); setWorking(true); try { await callback(); await refresh(); } catch (error) { setError(error.message); await refresh().catch(() => {}); } finally { setWorking(false); } }
    async function save(changes, consent) { await api({ action: 'preferences', name: target, revision: state.preferences.revision, changes, consent }); }
    async function check() { setError(''); setChecking(true); try { await api({ action: 'check', name: target }); await refresh(); } catch (error) { setError(error.message); } finally { setChecking(false); } }
    async function install() {
      setDialog(null); manualOperation = true; notify();
      await perform(async () => {
        try {
          await heartbeat();
          const started = await api({ action: 'install', name: row.name, version: row.release.version, confirmation: 'update-installed-plugin' });
          while (alive) {
            await new Promise(resolve => setTimeout(resolve, 800)); await heartbeat(); await refresh();
            if (state.job?.id !== started.id) throw new Error('operation-unconfirmed');
            if (!activeJob()) break;
          }
        } finally { manualOperation = false; notify(); }
      });
    }
    async function showNotes() {
      if (notesOpen) { setNotesOpen(false); return; }
      setNotesOpen(true); setNotes(null); setLoadingNotes(true); setError('');
      try { setNotes(await api({ action: 'notes', name: target, version: row.release.version })); } catch (error) { setError(error.message); } finally { setLoadingNotes(false); }
    }
    if (!snapshot || !row) return h(W.Status, null, t('此插件尚未安装或已从当前 profile 移除。', 'This plugin is not installed in the current profile.'));
    const title = language() === 'en' ? original.labelEn : original.label;
    const ownPage = pageState(true), unconfirmed = ['unknown', 'restore-failed'].includes(snapshot.job?.state), pageBusy = ownPage.busy || (snapshot.pages.clients || []).some(client => client.id !== id && client.busy), installLocked = working || activeJob() || unconfirmed || snapshot.updaterRestart || snapshot.preferenceError || !snapshot.activity.known || snapshot.activity.busy || snapshot.pages.dirty || ownPage.dirty || pageBusy || !snapshot.pages.known;
    const checkingThis = checking || snapshot.checkingNames?.includes(target);
    const status = row.sourceKind !== 'registry' ? t('本地 / 外部来源，保留原安装方式', 'Local / external source; keep original install method') : row.loadError ? t('加载异常，请先检查官方插件管理', 'Loading error; check native plugin management') : row.error ? t('检查失败，可以重试', 'Check failed; retry available') : row.release && !row.release.compatible ? t('新版本暂不兼容当前环境：', 'Latest release is incompatible with this environment: ') + requirement(row.release) : row.available ? (prefs.ignoredVersion === row.release.version ? t('已忽略提醒，仍可手动更新', 'Reminder ignored; manual update available') : t('有新版本', 'Update available')) : row.checkedAt ? t('当前已是最新稳定版', 'Latest stable version') : t('尚未检查', 'Not checked yet');
    return h(FooterFrame, { name, label: title, subtitle: original.name + ' · ' + original.version, actions: h(W.Button, { icon: 'refresh', disabled: checkingThis || row.sourceKind !== 'registry', onClick: check }, checkingThis ? t('正在检查…', 'Checking…') : target === '@stardustlc/dsh-suite' ? t('检查整包更新', 'Check Suite updates') : t('检查更新', 'Check for updates')) },
      original.bundledBy && h(W.Status, null, t('此插件随 Suite 安装。以下设置与安装作用于 Suite 整包，以保持组件版本一致。单独安装的插件可以独立更新。', 'This plugin was installed through Suite. These controls update Suite as a package so its components stay consistent. Independently installed plugins update individually.')),
      h('section', { className: 'w-section' }, (original.bundledBy || row.available) && h('p', { className: 'updates-version' }, target + ' · ' + row.version, row.release?.version && row.release.version !== row.version ? ' → ' + row.release.version : ''), h('p', { className: 'w-muted updates-note' }, status), !row.enabled && h('p', { className: 'w-muted' }, t('当前已停用，更新后仍保持停用。', 'Currently disabled; it will remain disabled after updating.')), row.checkedAt && h('p', { className: 'w-muted updates-note' }, t('上次检查：', 'Last checked: ') + new Date(row.checkedAt).toLocaleString(language() === 'en' ? 'en-US' : 'zh-CN')),
        h('div', { className: 'w-toolbar' }, row.available && row.sourceKind === 'registry' && h(W.Button, { variant: 'primary', icon: 'download', disabled: installLocked || row.loadError, onClick: () => setDialog('install') }, target === '@stardustlc/dsh-suite' ? t('更新 Suite 整包', 'Update whole Suite') : t('更新此插件', 'Update this plugin')), row.release && h(W.Button, { variant: 'ghost', onClick: showNotes, 'aria-expanded': notesOpen }, t('更新记录', 'Release notes')), row.available && h(W.Button, { variant: 'ghost', disabled: working, onClick: () => perform(() => api({ action: 'later', name: target, revision: state.preferences.revision })) }, t('明天再提醒', 'Remind me tomorrow')), row.available && prefs.ignoredVersion !== row.release.version && h(W.Button, { variant: 'ghost', disabled: working, onClick: () => perform(() => api({ action: 'ignore', name: target, revision: state.preferences.revision, version: row.release.version })) }, t('忽略此版本提醒', 'Ignore this reminder')))),
      notesOpen && h('section', { className: 'updates-notes', 'aria-label': t('更新记录', 'Release notes') }, h('strong', null, target + ' · ' + (notes?.version || row.release?.version || '')), loadingNotes ? h('p', null, t('正在读取…', 'Loading…')) : notes?.text ? h('pre', null, notes.text) : h('p', null, t('未找到此版本的独立更新记录。', 'No separate notes were found for this version.')), notes?.url && h('a', { href: notes.url, target: '_blank', rel: 'noreferrer noopener' }, t('查看仓库更新记录', 'View repository changelog'))),
      h('details', { className: 'updates-options' }, h('summary', null, t('更新选项', 'Update options'), ' · ', prefs.checkEnabled ? t('自动检查：开', 'Checks: on') : t('自动检查：关', 'Checks: off'), ' · ', prefs.autoInstall ? t('自动安装：开', 'Install: on') : t('自动安装：关', 'Install: off')), h('section', { className: 'updates-settings', 'aria-label': t('这个插件的更新偏好', 'Update preferences for this plugin') },
        h('div', null, h(W.Switch, { label: t('自动检查这个插件的更新', 'Automatically check this plugin'), checked: prefs.checkEnabled, disabled: working || !!snapshot.preferenceError || row.sourceKind !== 'registry', onChange: event => perform(() => save({ checkEnabled: event.target.checked })) }), h('p', { className: 'w-muted updates-note' }, t('默认开启，每天最多一次。只影响这个插件，关闭后仍可手动检查。', 'On by default, at most once daily. This affects only this plugin; manual checks remain available.'))),
        h('div', null, h(W.Switch, { label: t('空闲时自动安装这个插件的补丁', 'Install patches for this plugin while idle'), checked: prefs.autoInstall, disabled: working || !!snapshot.preferenceError || row.sourceKind !== 'registry', onChange: event => event.target.checked ? setDialog('automatic') : perform(() => save({ autoInstall: false })) }), h('p', { className: 'w-muted updates-note' }, t('默认关闭。明确开启后，仅空闲且没有未保存修改时安装兼容补丁。其他插件的开关不变。', 'Off by default. Explicitly enable compatible patches while idle with no unsaved changes. Other plugins’ settings stay unchanged.'))))),
      error && h(W.Status, { tone: 'error' }, message(error)), snapshot.preferenceError && h(W.Status, { tone: 'error' }, message('preferences-unreadable')),
      snapshot.pendingRestart && h(W.Status, null, snapshot.updaterRestart ? message('restart-required') : t('已有更新等待手动重启后生效。你可以继续工作，自动安装已暂停。', 'Some updates need a manual restart. Continue your work; automatic installation is paused.')),
      prefs.autoInstall && snapshot.autoReady === false && h(W.Status, null, message('page-not-ready')),
      snapshot.pages.clients.some(client => !client.fresh) && h(W.Status, null, h('p', null, t('有窗口已断开，无法确认是否还有未保存修改。仍在使用的窗口请先保存并刷新；已关闭的窗口可以手动重新确认。', 'A disconnected window may contain unsaved changes. Save and refresh windows still in use. If they are closed, you can confirm that manually.')), h(W.Button, { onClick: () => setDialog('windows') }, t('重新确认已关闭的窗口', 'Confirm closed windows'))),
      (snapshot.pages.dirty || ownPage.dirty) && h(W.Status, null, message('page-dirty')), (snapshot.activity.busy || pageBusy) && h(W.Status, null, message(snapshot.activity.busy ? 'busy' : 'page-busy')),
      prefs.deferredUntil > Date.now() && h(W.Status, null, t('此插件已推迟提醒和自动安装 24 小时，仍可手动更新。', 'Reminders and automatic installation for this plugin are deferred for 24 hours. Manual updates remain available.')),
      unconfirmed && h(W.Status, { tone: 'error' }, message('operation-unconfirmed')),
      job && h('section', { className: 'w-section', 'aria-label': t('这个插件的更新进度', 'Update progress for this plugin') }, h('h3', null, jobLabel(job)), h('p', { className: 'w-muted' }, job.from + ' → ' + job.to + (job.mode === 'automatic' ? t(' · 自动补丁更新', ' · Automatic patch') : '')), (job.reason || job.outcome?.result?.error?.code) && h(W.Status, { tone: 'error' }, message(job.reason || job.outcome.result.error.code)), activeJob() && h(W.Button, { disabled: job.state === 'cancelling', onClick: () => perform(() => api({ action: 'cancel', id: job.id })) }, t('取消更新', 'Cancel update')), h('p', { className: 'w-muted updates-note' }, t('安装开始后，取消由官方包管理器处理；已落盘的写入以实际结果或恢复状态为准。', 'After installation starts, the native package manager handles cancellation. Completed writes and recovery are reported as they occur.'))),
      dialog && h(W.Dialog, { title: dialog === 'windows' ? t('断开的窗口都已关闭？', 'Are the disconnected windows closed?') : dialog === 'automatic' ? t('允许这个插件自动安装补丁？', 'Allow automatic patches for this plugin?') : t('确认更新此插件', 'Confirm this plugin update'), closeLabel: t('关闭', 'Close'), onClose: () => setDialog(null) },
        target === '@stardustlc/dsh-suite' && h('p', null, t('此处操作的是 Suite 整包，包含 18 个组件。独立安装的其他插件不受影响。', 'This action applies to the whole Suite, including its 18 components. Other independently installed plugins are unaffected.')),
        dialog === 'windows' ? h('div', { className: 'w-stack' }, h('p', null, t('只清除超过 45 秒未回应的其他窗口记录。请先确认它们已经关闭；仍在使用的窗口请保存修改并刷新。当前或仍在回应的窗口保护会保留。', 'Only other windows silent for over 45 seconds are cleared. Confirm that they are closed; save and refresh windows still in use. Current and responsive windows remain protected.')), h('div', { className: 'w-toolbar' }, h(W.Button, { onClick: () => setDialog(null) }, t('取消', 'Cancel')), h(W.Button, { onClick: () => { setDialog(null); void perform(() => api({ ...pageState(true), action: 'reconfirm-windows', confirmation: 'other-stale-windows-are-closed' })); } }, t('已关闭，重新确认状态', 'They are closed; reconfirm')))) :
        dialog === 'automatic' ? h('div', { className: 'w-stack' }, h('p', null, (language() === 'en' ? row.labelEn : row.label) + ' · ' + target), h('p', null, t('你正在主动启用这个插件的自动安装。只处理兼容的稳定补丁；有任务、未保存修改、未知窗口或等待重启时暂停。', 'You are explicitly enabling automatic installation for this plugin. Only compatible stable patches qualify; running tasks, unsaved changes, unknown windows or a pending restart pause it.')), h('p', null, t('不会自动重启 DSH，其他插件不会跟着开启。可随时关闭。', 'DSH will not restart automatically, and other plugins will not be enabled for automatic updates. Turn it off anytime.')), h('div', { className: 'w-toolbar' }, h(W.Button, { onClick: () => setDialog(null) }, t('保持关闭', 'Keep off')), h(W.Button, { variant: 'primary', onClick: () => { setDialog(null); void perform(() => save({ checkEnabled: true, autoInstall: true }, 'enable-idle-patch-updates')); } }, t('允许此插件自动安装补丁', 'Allow patches for this plugin')))) :
        h('div', { className: 'w-stack' }, h('p', { className: 'updates-version' }, target + ': ' + row.version + ' → ' + row.release.version), h('p', null, t('通过 DSH 官方插件管理器安装。需要重启时，由你手动决定时间；停用状态会保留。', 'Install through DSH’s native plugin manager. Choose when to restart if needed; disabled status is preserved.')), h('p', { className: 'w-muted' }, t('来源：npm 官方 registry，网络不可达时回退 npmmirror。安装前再次核对版本与完整性。', 'Source: official npm registry, with npmmirror fallback if unreachable. Version and integrity are checked again before installation.')), (ownPage.dirty || snapshot.pages.dirty) && h(W.Status, null, message('page-dirty')), h('div', { className: 'w-toolbar' }, h(W.Button, { onClick: () => setDialog(null) }, t('取消', 'Cancel')), h(W.Button, { variant: 'primary', disabled: installLocked || row.loadError, onClick: install }, t('确认安装此版本', 'Install this version')))))
    );
  }
  function NativeFooter({ subject }) {
    const snapshot = useSnapshot(), name = __stardustUpdatesDetailName(subject, snapshot?.rows || []);
    return name ? h(Panel, { name }) : null;
  }
  function Reminder() {
    useSnapshot();
    const row = state?.rows.find(row => { const prefs = preferences(row.name); return row.available && !row.updating && !row.bundledBy && prefs.checkEnabled && prefs.deferredUntil <= Date.now() && prefs.ignoredVersion !== row.release.version && !notified.has(row.name + '@' + row.release.version); });
    if (!row && !legacyHint) return null;
    let Toast; try { Toast = require('@deepseek-ai/dsh-client-ui-primitives').Toast; } catch { return null; }
    if (!Toast) return null;
    const hint = legacyHint, key = hint ? 'legacy-' + hint : row.name + '@' + row.release.version;
    return h(Toast, { key, text: hint ? hint + t('：请打开「插件」中的此插件详情页，在底部管理更新。', ': open its details in Plugins to manage updates at the bottom.') : (language() === 'en' ? row.labelEn : row.label) + t('有新版本，可在页面底部查看。', ' has an update. Review it at the bottom of its page.'), icon: h(W.Icon, { name: 'refresh', size: 18 }), holdMs: 7000, onDone: () => { if (hint) legacyHint = null; else notified.add(key); notify(); } });
  }
  function register() {
    if (!alive) return;
    if (!registered) {
      registered = true; pool.clients.add(client);
      ctx.slots.inject('plugins.detail.section', () => ctx.slots.register({ name: 'plugins.detail.section', id: 'stardustlc.plugin-update-footer', order: 1000 }, NativeFooter));
      ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'stardustlc.plugin-update-reminder' }, Reminder));
      notify();
    }
  }
  async function poll() {
    if (inPoll || !alive || !shared.refs.size) return;
    inPoll = true;
    try { await refresh(); register(); await heartbeat(); }
    catch { /* Owner-only controls stay absent for guests and unsupported hosts. */ }
    finally { inPoll = false; }
  }
  const timer = setInterval(() => { void poll(); }, 15000), first = setTimeout(() => { void poll(); }, 100);
  const client = { t, Footer: Panel, Button: W.Button, open(name) { const footer = [...document.querySelectorAll('[data-plugin-update-footer]')].find(node => node.getAttribute('data-plugin-update-footer') === name); if (footer) footer.scrollIntoView({ block: 'end', behavior: 'smooth' }); else { legacyHint = name; notify(); } }, has: name => registered && !!originalRow(name), row: rowFor, dispose() {
    close(); alive = false; clearTimeout(first); clearInterval(timer); pool.clients.delete(client);
    pool.listeners.delete(guardChanged); listeners.clear();
    for (const event of ['pointerdown', 'keydown', 'input']) document.removeEventListener(event, interaction, true);
    window.removeEventListener('pagehide', close);
    for (const controller of requests) controller.abort();
    for (const listener of pool.viewListeners) listener();
  } };
  return client;
}

/* STARDUSTLC_UPDATE_CLIENT_BODY_START */
window.__ModuleLoader__.load(__stardustUpdatesWrap({id:"dsh-flakefinder",factory:require=>({apply(){}})},{"name":"dsh-flakefinder","version":"0.1.0","hasWorkbench":false,"packageVersion":"0.4.10","label":"不稳定测试排查","labelEn":"Flakefinder","suiteComponent":true,"sectionIds":[],"iconData":"data:image/webp;base64,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"}));

/* STARDUSTLC_UPDATE_CLIENT_BODY_END */
})();
