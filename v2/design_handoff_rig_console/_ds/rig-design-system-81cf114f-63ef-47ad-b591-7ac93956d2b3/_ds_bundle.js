/* @ds-bundle: {"format":4,"namespace":"RelentlessDesignSystem_81cf11","components":[{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"CardBody","sourcePath":"components/core/Card.jsx"},{"name":"CardEyebrow","sourcePath":"components/core/Card.jsx"},{"name":"CardTitle","sourcePath":"components/core/Card.jsx"},{"name":"CardFooter","sourcePath":"components/core/Card.jsx"},{"name":"Icon","sourcePath":"components/core/Icon.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"Tag","sourcePath":"components/core/Tag.jsx"},{"name":"Dialog","sourcePath":"components/feedback/Dialog.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"Tooltip","sourcePath":"components/feedback/Tooltip.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Radio","sourcePath":"components/forms/Radio.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"Textarea","sourcePath":"components/forms/Textarea.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"},{"name":"StageStepper","sourcePath":"components/workflow/StageStepper.jsx"},{"name":"StatusBadge","sourcePath":"components/workflow/StatusBadge.jsx"}],"sourceHashes":{"components/core/Badge.jsx":"cd482a5f2427","components/core/Button.jsx":"b1ee53085aad","components/core/Card.jsx":"e724f21d7b15","components/core/Icon.jsx":"f9a53403400c","components/core/IconButton.jsx":"ce99fe1b0047","components/core/Tag.jsx":"8af1ef09f5a5","components/feedback/Dialog.jsx":"0164496a48bf","components/feedback/Toast.jsx":"935537a4cb16","components/feedback/Tooltip.jsx":"301019c16899","components/forms/Checkbox.jsx":"9dd72219099b","components/forms/Input.jsx":"e72e36da1ed6","components/forms/Radio.jsx":"0766e8b1000a","components/forms/Select.jsx":"1f5eb993544e","components/forms/Switch.jsx":"70d531f0b7c9","components/forms/Textarea.jsx":"1d3ea8a463a9","components/navigation/Tabs.jsx":"8e17afdcd89e","components/workflow/StageStepper.jsx":"11ee606ca761","components/workflow/StatusBadge.jsx":"00b5b94bea97","ui_kits/dashboard/App.jsx":"adcfb83b57f5","ui_kits/dashboard/AuditScreen.jsx":"33f96d96bde9","ui_kits/dashboard/DashboardScreen.jsx":"3716f31dc7d9","ui_kits/dashboard/RunDetailScreen.jsx":"b9db64bcecf0","ui_kits/dashboard/RunsScreen.jsx":"e6df886b5dbf","ui_kits/dashboard/Sidebar.jsx":"56f1e435131e","ui_kits/dashboard/SpecDetailScreen.jsx":"3444864e0062","ui_kits/dashboard/SpecsScreen.jsx":"98cb1fb40e5d","ui_kits/dashboard/Topbar.jsx":"953b4a563a25","ui_kits/dashboard/TrailDetailScreen.jsx":"9e2bece9b18e","ui_kits/dashboard/TrailsScreen.jsx":"717efa9a0138","ui_kits/dashboard/data.js":"eb7f5be03100"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.RelentlessDesignSystem_81cf11 = window.RelentlessDesignSystem_81cf11 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Badge — compact status/count label. Mono, pill-shaped.
 */
function Badge({
  children,
  tone = 'neutral',
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    className: `rl-badge rl-badge--${tone} ${className}`
  }, rest), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Card — content surface. Compose with the sub-parts or pass children directly.
 */
function Card({
  children,
  interactive = false,
  flat = false,
  className = '',
  ...rest
}) {
  const cls = ['rl-card', flat ? 'rl-card--flat' : '', interactive ? 'rl-card--interactive' : '', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("div", _extends({
    className: cls
  }, rest), children);
}
function CardBody({
  children,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: `rl-card__pad ${className}`
  }, rest), children);
}
function CardEyebrow({
  children,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: "rl-card__eyebrow"
  }, rest), children);
}
function CardTitle({
  children,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: "rl-card__title"
  }, rest), children);
}
function CardFooter({
  children,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: `rl-card__footer ${className}`
  }, rest), children);
}
Object.assign(__ds_scope, { Card, CardBody, CardEyebrow, CardTitle, CardFooter });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const toPascal = s => String(s).replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase());
function renderNode(node, key) {
  const [tag, attrs, children] = node;
  return React.createElement(tag, {
    key,
    ...attrs
  }, Array.isArray(children) ? children.map(renderNode) : undefined);
}

/**
 * Icon — thin Lucide wrapper enforcing brand stroke + size.
 * Requires the Lucide UMD global (window.lucide) to be loaded on the page.
 */
function Icon({
  name,
  size = 16,
  strokeWidth = 1.75,
  color = 'currentColor',
  style = {},
  ...rest
}) {
  const lib = typeof window !== 'undefined' && window.lucide ? window.lucide.icons || window.lucide : null;
  const data = lib ? lib[toPascal(name)] : null;
  const nodes = data ? Array.isArray(data[0]) ? data : data[2] : null;
  return /*#__PURE__*/React.createElement("svg", _extends({
    xmlns: "http://www.w3.org/2000/svg",
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      flex: 'none',
      display: 'block',
      ...style
    },
    "aria-hidden": "true"
  }, rest), nodes && nodes.map(renderNode));
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Icon.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Button — primary action control for Rig.
 */
function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  block = false,
  disabled = false,
  as = 'button',
  className = '',
  ...rest
}) {
  const Tag = as;
  const cls = ['rl-btn', `rl-btn--${variant}`, `rl-btn--${size}`, block ? 'rl-btn--block' : '', className].filter(Boolean).join(' ');
  const glyph = size === 'lg' ? 18 : 16;
  return /*#__PURE__*/React.createElement(Tag, _extends({
    className: cls,
    disabled: Tag === 'button' ? disabled : undefined,
    "aria-disabled": disabled || undefined
  }, rest), icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: glyph
  }), children, iconRight && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconRight,
    size: glyph
  }));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * IconButton — square, icon-only action (toolbars, table rows, dialogs).
 */
function IconButton({
  icon,
  size = 'md',
  variant = 'ghost',
  label,
  disabled = false,
  className = '',
  ...rest
}) {
  const cls = ['rl-iconbtn', `rl-iconbtn--${size}`, variant === 'solid' ? 'rl-iconbtn--solid' : '', className].filter(Boolean).join(' ');
  const glyph = size === 'lg' ? 20 : size === 'sm' ? 15 : 17;
  return /*#__PURE__*/React.createElement("button", _extends({
    className: cls,
    disabled: disabled,
    "aria-label": label,
    title: label
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: glyph
  }));
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/core/Tag.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Tag — removable metadata chip (actors, models, labels).
 */
function Tag({
  children,
  onRemove,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    className: `rl-tag ${className}`
  }, rest), children, onRemove && /*#__PURE__*/React.createElement("span", {
    className: "rl-tag__x",
    role: "button",
    "aria-label": "Remove",
    onClick: onRemove
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "x",
    size: 12
  })));
}
Object.assign(__ds_scope, { Tag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Tag.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Dialog.jsx
try { (() => {
/**
 * Dialog — modal surface for confirmations and review gates.
 * Controlled via `open`; renders nothing when closed.
 */
function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  width,
  className = ''
}) {
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "rl-dialog__scrim",
    onClick: onClose
  }, /*#__PURE__*/React.createElement("div", {
    className: `rl-dialog__panel ${className}`,
    style: width ? {
      maxWidth: width
    } : undefined,
    role: "dialog",
    "aria-modal": "true",
    onClick: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("div", {
    className: "rl-dialog__header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rl-dialog__title"
  }, title), onClose && /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: "x",
    label: "Close",
    size: "sm",
    onClick: onClose
  })), /*#__PURE__*/React.createElement("div", {
    className: "rl-dialog__body"
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    className: "rl-dialog__footer"
  }, footer)));
}
Object.assign(__ds_scope, { Dialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Dialog.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
const GLYPH = {
  success: 'circle-check',
  danger: 'circle-x',
  info: 'info',
  neutral: 'bell'
};

/** Toast — transient notification. Render inside a fixed-position stack. */
function Toast({
  title,
  message,
  tone = 'neutral',
  onClose,
  className = ''
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: `rl-toast rl-toast--${tone} ${className}`,
    role: "status"
  }, /*#__PURE__*/React.createElement("span", {
    className: "rl-toast__icon"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: GLYPH[tone] || 'bell',
    size: 18
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, title && /*#__PURE__*/React.createElement("div", {
    className: "rl-toast__title"
  }, title), message && /*#__PURE__*/React.createElement("div", {
    className: "rl-toast__msg"
  }, message)), onClose && /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: "x",
    label: "Dismiss",
    size: "sm",
    onClick: onClose
  }));
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Tooltip.jsx
try { (() => {
/** Tooltip — hover hint. Wraps its trigger children. CSS-driven, top-positioned. */
function Tooltip({
  label,
  children,
  className = ''
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: `rl-tooltip ${className}`
  }, children, /*#__PURE__*/React.createElement("span", {
    className: "rl-tooltip__bubble",
    role: "tooltip"
  }, label));
}
Object.assign(__ds_scope, { Tooltip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Tooltip.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Checkbox — square check control with label. */
function Checkbox({
  label,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", {
    className: `rl-choice ${className}`
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "checkbox"
  }, rest)), /*#__PURE__*/React.createElement("span", {
    className: "rl-choice__box rl-choice__box--check"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "check",
    size: 13,
    strokeWidth: 3
  })), label && /*#__PURE__*/React.createElement("span", null, label));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Input — single-line text field, optionally wrapped with label + hint. */
function Input({
  label,
  hint,
  error,
  mono = false,
  id,
  className = '',
  ...rest
}) {
  const fid = id || (label ? `in-${Math.random().toString(36).slice(2, 8)}` : undefined);
  const cls = ['rl-input', mono ? 'rl-input--mono' : '', error ? 'rl-input--error' : '', className].filter(Boolean).join(' ');
  const field = /*#__PURE__*/React.createElement("input", _extends({
    id: fid,
    className: cls,
    "aria-invalid": !!error
  }, rest));
  if (!label && !hint && !error) return field;
  return /*#__PURE__*/React.createElement("div", {
    className: "rl-field"
  }, label && /*#__PURE__*/React.createElement("label", {
    className: "rl-field__label",
    htmlFor: fid
  }, label), field, (error || hint) && /*#__PURE__*/React.createElement("span", {
    className: `rl-field__hint ${error ? 'rl-field__hint--error' : ''}`
  }, error || hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Radio.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Radio — round single-choice control with label. Share a `name`. */
function Radio({
  label,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", {
    className: `rl-choice ${className}`
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "radio"
  }, rest)), /*#__PURE__*/React.createElement("span", {
    className: "rl-choice__box rl-choice__box--radio"
  }, /*#__PURE__*/React.createElement("span", {
    className: "rl-dot"
  })), label && /*#__PURE__*/React.createElement("span", null, label));
}
Object.assign(__ds_scope, { Radio });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Radio.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Select — native dropdown with brand chevron. */
function Select({
  label,
  hint,
  options = [],
  children,
  id,
  className = '',
  ...rest
}) {
  const fid = id || (label ? `sel-${Math.random().toString(36).slice(2, 8)}` : undefined);
  const field = /*#__PURE__*/React.createElement("select", _extends({
    id: fid,
    className: `rl-select ${className}`
  }, rest), options.map(o => typeof o === 'string' ? /*#__PURE__*/React.createElement("option", {
    key: o,
    value: o
  }, o) : /*#__PURE__*/React.createElement("option", {
    key: o.value,
    value: o.value
  }, o.label)), children);
  if (!label && !hint) return field;
  return /*#__PURE__*/React.createElement("div", {
    className: "rl-field"
  }, label && /*#__PURE__*/React.createElement("label", {
    className: "rl-field__label",
    htmlFor: fid
  }, label), field, hint && /*#__PURE__*/React.createElement("span", {
    className: "rl-field__hint"
  }, hint));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Switch — on/off toggle (executor selection, feature flags). */
function Switch({
  label,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", {
    className: `rl-switch ${className}`
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "checkbox",
    role: "switch"
  }, rest)), /*#__PURE__*/React.createElement("span", {
    className: "rl-switch__track"
  }, /*#__PURE__*/React.createElement("span", {
    className: "rl-switch__thumb"
  })), label && /*#__PURE__*/React.createElement("span", null, label));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/forms/Textarea.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Textarea — multi-line text (denial reasons, notes, prompts). */
function Textarea({
  label,
  hint,
  error,
  id,
  className = '',
  ...rest
}) {
  const fid = id || (label ? `ta-${Math.random().toString(36).slice(2, 8)}` : undefined);
  const cls = ['rl-textarea', error ? 'rl-textarea--error' : '', className].filter(Boolean).join(' ');
  const field = /*#__PURE__*/React.createElement("textarea", _extends({
    id: fid,
    className: cls,
    "aria-invalid": !!error
  }, rest));
  if (!label && !hint && !error) return field;
  return /*#__PURE__*/React.createElement("div", {
    className: "rl-field"
  }, label && /*#__PURE__*/React.createElement("label", {
    className: "rl-field__label",
    htmlFor: fid
  }, label), field, (error || hint) && /*#__PURE__*/React.createElement("span", {
    className: `rl-field__hint ${error ? 'rl-field__hint--error' : ''}`
  }, error || hint));
}
Object.assign(__ds_scope, { Textarea });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Textarea.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
/**
 * Tabs — horizontal section switcher (controlled).
 * items: [{ value, label, icon? }]
 */
function Tabs({
  items = [],
  value,
  onChange,
  className = ''
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: `rl-tabs ${className}`,
    role: "tablist"
  }, items.map(t => /*#__PURE__*/React.createElement("button", {
    key: t.value,
    role: "tab",
    "aria-selected": value === t.value,
    className: `rl-tabs__tab ${value === t.value ? 'rl-tabs__tab--active' : ''}`,
    onClick: () => onChange && onChange(t.value)
  }, t.icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: t.icon,
    size: 15
  }), t.label)));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// components/workflow/StageStepper.jsx
try { (() => {
const DEFAULT_STAGES = [{
  key: 'requirements',
  label: 'Requirements'
}, {
  key: 'design',
  label: 'Design'
}, {
  key: 'tasks',
  label: 'Tasks'
}, {
  key: 'implementation',
  label: 'Implementation'
}];

/**
 * StageStepper — the spec pipeline progression.
 * `current` = index of the active stage; earlier stages render as done.
 */
function StageStepper({
  stages = DEFAULT_STAGES,
  current = 0,
  compact = false,
  className = ''
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: `rl-stepper ${className}`
  }, stages.map((s, i) => {
    const state = i < current ? 'done' : i === current ? 'current' : 'pending';
    return /*#__PURE__*/React.createElement(React.Fragment, {
      key: s.key || i
    }, i > 0 && /*#__PURE__*/React.createElement("span", {
      className: `rl-stepper__bar ${i <= current ? 'rl-stepper__bar--done' : 'rl-stepper__bar--pending'}`
    }), /*#__PURE__*/React.createElement("span", {
      className: `rl-stepper__step rl-stepper__step--${state}`
    }, /*#__PURE__*/React.createElement("span", {
      className: "rl-stepper__node"
    }, state === 'done' ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: "check",
      size: 14,
      strokeWidth: 3
    }) : i + 1), !compact && /*#__PURE__*/React.createElement("span", {
      className: "rl-stepper__label"
    }, s.label)));
  }));
}
Object.assign(__ds_scope, { StageStepper });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/workflow/StageStepper.jsx", error: String((e && e.message) || e) }); }

// components/workflow/StatusBadge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const LABEL = {
  draft: 'draft',
  in_review: 'in_review',
  approved: 'approved',
  denied: 'denied',
  running: 'running'
};

/**
 * StatusBadge — the five workflow states, color + dot coded.
 */
function StatusBadge({
  status = 'draft',
  label,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    className: `rl-status rl-status--${status} ${className}`
  }, rest), /*#__PURE__*/React.createElement("span", {
    className: "rl-status__dot"
  }), label || LABEL[status] || status);
}
Object.assign(__ds_scope, { StatusBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/workflow/StatusBadge.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/App.jsx
try { (() => {
const {
  Toast
} = window.RelentlessDesignSystem_81cf11;
function App() {
  const [route, setRoute] = React.useState({
    screen: 'home'
  });
  const [collapsed, setCollapsed] = React.useState(false);
  const [project, setProject] = React.useState(window.RL_DATA.projects[0]);
  const switchProject = p => {
    if (p.slug === project.slug) return;
    setProject(p);
    setRoute({
      screen: 'home'
    });
    pushToast({
      tone: 'info',
      title: 'Project switched',
      message: `Scoped to ${p.slug} — specs, trails, runs and audit now filter by project_id.`
    });
  };
  const [toasts, setToasts] = React.useState([]);
  const pushToast = t => {
    const id = Math.random().toString(36).slice(2);
    setToasts(list => [...list, {
      ...t,
      id
    }]);
    setTimeout(() => setToasts(list => list.filter(x => x.id !== id)), 4200);
  };
  const dismiss = id => setToasts(list => list.filter(x => x.id !== id));
  const openSpec = id => setRoute({
    screen: 'detail',
    specId: id
  });
  const openTrail = id => setRoute({
    screen: 'trail',
    trailId: id
  });
  const crumbs = (() => {
    if (route.screen === 'detail') {
      const s = window.RL_DATA.specs.find(x => x.id === route.specId);
      return ['Specs', s ? `#${s.id}` : 'Spec'];
    }
    if (route.screen === 'trail') return ['Trails', route.trailId || 'Trail'];
    if (route.screen === 'run') return ['Runs', route.runId || 'Run'];
    return [{
      home: 'Overview',
      trails: 'Trails',
      specs: 'Specs',
      runs: 'Runs',
      audit: 'Audit log',
      actors: 'Actors'
    }[route.screen] || 'Overview'];
  })();
  return /*#__PURE__*/React.createElement("div", {
    className: `dk-app ${collapsed ? 'dk-app--collapsed' : ''}`
  }, /*#__PURE__*/React.createElement(window.Sidebar, {
    route: route,
    onNavigate: setRoute,
    collapsed: collapsed,
    onToggle: () => setCollapsed(c => !c),
    project: project,
    onProject: switchProject
  }), /*#__PURE__*/React.createElement("div", {
    className: "dk-main"
  }, /*#__PURE__*/React.createElement(window.Topbar, {
    crumbs: crumbs,
    onNewSpec: () => pushToast({
      tone: 'info',
      title: 'New spec',
      message: 'Start with the grilling skill to draft requirements.'
    })
  }), /*#__PURE__*/React.createElement("div", {
    className: "dk-content"
  }, route.screen === 'home' && /*#__PURE__*/React.createElement(window.DashboardScreen, {
    onNavigate: setRoute,
    onOpenSpec: openSpec,
    onOpenTrail: openTrail
  }), route.screen === 'trails' && /*#__PURE__*/React.createElement(window.TrailsScreen, {
    onOpen: openTrail,
    onOpenSpec: openSpec
  }), route.screen === 'trail' && /*#__PURE__*/React.createElement(window.TrailDetailScreen, {
    trailId: route.trailId,
    onToast: pushToast,
    onOpenSpec: openSpec
  }), route.screen === 'specs' && /*#__PURE__*/React.createElement(window.SpecsScreen, {
    onOpen: openSpec
  }), route.screen === 'detail' && /*#__PURE__*/React.createElement(window.SpecDetailScreen, {
    specId: route.specId,
    onToast: pushToast
  }), route.screen === 'runs' && /*#__PURE__*/React.createElement(window.RunsScreen, {
    onOpen: id => setRoute({
      screen: 'run',
      runId: id
    })
  }), route.screen === 'run' && /*#__PURE__*/React.createElement(window.RunDetailScreen, {
    runId: route.runId,
    onToast: pushToast
  }), route.screen === 'audit' && /*#__PURE__*/React.createElement(window.AuditScreen, null), route.screen === 'actors' && /*#__PURE__*/React.createElement(window.ActorsScreen, null))), /*#__PURE__*/React.createElement("div", {
    className: "dk-toasts"
  }, toasts.map(t => /*#__PURE__*/React.createElement(Toast, {
    key: t.id,
    tone: t.tone,
    title: t.title,
    message: t.message,
    onClose: () => dismiss(t.id)
  }))));
}
Object.assign(window, {
  App
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/App.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/AuditScreen.jsx
try { (() => {
const {
  Badge,
  Icon
} = window.RelentlessDesignSystem_81cf11;
function AuditScreen() {
  const rows = window.RL_DATA.audit;
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "dk-page-h"
  }, /*#__PURE__*/React.createElement("h1", null, "Audit log"), /*#__PURE__*/React.createElement("span", {
    className: "dk-page-sub"
  }, "Append-only, one row per mutation in the same transaction \xB7 rejected writes never reach the log \u2014 the ", /*#__PURE__*/React.createElement("code", {
    style: {
      fontFamily: 'var(--font-mono)',
      color: 'var(--text-brand)'
    }
  }, "known_actors"), " guard fires first")), /*#__PURE__*/React.createElement("table", {
    className: "dk-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      width: 90
    }
  }, "Time"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 220
    }
  }, "Actor"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 110
    }
  }, "Action"), /*#__PURE__*/React.createElement("th", null, "Table"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 220
    }
  }, "Row"))), /*#__PURE__*/React.createElement("tbody", null, rows.map((r, i) => /*#__PURE__*/React.createElement("tr", {
    key: i,
    style: {
      cursor: 'default'
    }
  }, /*#__PURE__*/React.createElement("td", {
    className: "dk-mono"
  }, r.ts), /*#__PURE__*/React.createElement("td", {
    className: "dk-mono",
    style: {
      color: 'var(--text-body)'
    }
  }, r.actor), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    className: "dk-node"
  }, r.action)), /*#__PURE__*/React.createElement("td", {
    className: "dk-mono"
  }, r.table), /*#__PURE__*/React.createElement("td", {
    className: "dk-mono",
    style: {
      color: 'var(--text-body)'
    }
  }, r.row))))));
}
function ActorsScreen() {
  const actors = window.RL_DATA.actors;
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "dk-page-h"
  }, /*#__PURE__*/React.createElement("h1", null, "Actors"), /*#__PURE__*/React.createElement("span", {
    className: "dk-page-sub"
  }, "Registered ", /*#__PURE__*/React.createElement("code", {
    style: {
      fontFamily: 'var(--font-mono)',
      color: 'var(--text-brand)'
    }
  }, "known_actors"), " \xB7 synced at boot from the mounted skills directory")), /*#__PURE__*/React.createElement("table", {
    className: "dk-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Actor"), /*#__PURE__*/React.createElement("th", null, "Source"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 160
    }
  }, "Synced"))), /*#__PURE__*/React.createElement("tbody", null, actors.map((a, i) => /*#__PURE__*/React.createElement("tr", {
    key: i,
    style: {
      cursor: 'default'
    }
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    className: "dk-strong",
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 13
    }
  }, a.actor)), /*#__PURE__*/React.createElement("td", {
    className: "dk-mono"
  }, a.source), /*#__PURE__*/React.createElement("td", {
    className: "dk-mono"
  }, a.synced))))));
}
Object.assign(window, {
  AuditScreen,
  ActorsScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/AuditScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/DashboardScreen.jsx
try { (() => {
const {
  Badge,
  StatusBadge,
  Icon
} = window.RelentlessDesignSystem_81cf11;
function StatTile({
  icon,
  label,
  value,
  sub,
  tone,
  onClick
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    style: {
      textAlign: 'left',
      cursor: 'pointer',
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-md)',
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      fontFamily: 'var(--font-sans)',
      transition: 'background var(--dur-fast)'
    },
    onMouseEnter: e => e.currentTarget.style.background = 'var(--bg-hover)',
    onMouseLeave: e => e.currentTarget.style.background = 'var(--bg-surface)'
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 7,
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      letterSpacing: '.08em',
      textTransform: 'uppercase',
      color: 'var(--text-faint)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 13
  }), " ", label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 26,
      fontWeight: 600,
      lineHeight: 1,
      color: tone || 'var(--text-strong)'
    }
  }, value), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      color: 'var(--text-muted)'
    }
  }, sub));
}
function DashboardScreen({
  onNavigate,
  onOpenSpec,
  onOpenTrail
}) {
  const d = window.RL_DATA;
  const activeTrails = d.trails.filter(t => t.status === 'active');
  const stuck = d.trails.reduce((n, t) => n + t.stuck, 0);
  const inReview = d.specs.filter(s => s.status === 'in_review');
  const running = d.runs.filter(r => r.status === 'running');
  const gates = d.runs.filter(r => r.kind === 'human' && r.status === 'in_review');
  const attention = [...gates.map(r => ({
    key: r.id,
    icon: 'user-round',
    tone: 'var(--info)',
    title: `Human gate · ${r.node}`,
    meta: `${r.id} · waiting ${r.started}`,
    action: 'Review',
    go: () => onNavigate({
      screen: 'runs'
    })
  })), ...Object.values(d.trailDetails).flatMap(t => t.waypoints.filter(w => w.stuck).map(w => ({
    key: t.id + w.n,
    icon: 'triangle-alert',
    tone: 'var(--amber-400)',
    title: `Stuck claim · ${w.title}`,
    meta: `${t.id} · W${w.n} · ${w.claimedBy} · held ${w.claimedFor}`,
    action: 'Inspect',
    go: () => onOpenTrail(t.id)
  }))), ...d.specs.filter(s => s.status === 'denied').map(s => ({
    key: s.id,
    icon: 'circle-x',
    tone: 'var(--danger)',
    title: `Stage denied · ${s.title}`,
    meta: `#${s.id} · ${s.stage} · “${s.denialReason}”`,
    action: 'Open',
    go: () => onOpenSpec(s.id)
  }))];
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "dk-page-h"
  }, /*#__PURE__*/React.createElement("h1", null, "Overview"), /*#__PURE__*/React.createElement("span", {
    className: "dk-page-sub"
  }, "Everything moving through Rig right now"), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7,
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      color: 'var(--text-muted)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 7,
      height: 7,
      borderRadius: 99,
      background: 'var(--green-400)'
    }
  }), "sse \xB7 connected")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4,1fr)',
      gap: 14,
      marginBottom: 22
    }
  }, /*#__PURE__*/React.createElement(StatTile, {
    icon: "compass",
    label: "Active trails",
    value: activeTrails.length,
    sub: `${stuck} stuck claim${stuck === 1 ? '' : 's'}`,
    onClick: () => onNavigate({
      screen: 'trails'
    })
  }), /*#__PURE__*/React.createElement(StatTile, {
    icon: "file-text",
    label: "Specs in review",
    value: inReview.length,
    sub: `${d.specs.length} total specs`,
    onClick: () => onNavigate({
      screen: 'specs'
    })
  }), /*#__PURE__*/React.createElement(StatTile, {
    icon: "play",
    label: "Runs active",
    value: running.length,
    sub: `${gates.length} human gate${gates.length === 1 ? '' : 's'} waiting`,
    onClick: () => onNavigate({
      screen: 'runs'
    })
  }), /*#__PURE__*/React.createElement(StatTile, {
    icon: "triangle-alert",
    label: "Needs attention",
    value: attention.length,
    sub: "gates \xB7 stuck \xB7 denied",
    tone: attention.length ? 'var(--amber-400)' : undefined
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 340px',
      gap: 22,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 22,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement("div", {
    className: "dk-sec-h"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "inbox",
    size: 14
  }), " Attention queue"), /*#__PURE__*/React.createElement("div", {
    className: "dk-meta"
  }, attention.map(a => /*#__PURE__*/React.createElement("div", {
    key: a.key,
    className: "dk-meta__row",
    style: {
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: a.tone,
      display: 'inline-flex',
      flex: 'none'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: a.icon,
    size: 15
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "dk-strong",
    style: {
      display: 'block',
      fontSize: 13
    }
  }, a.title), /*#__PURE__*/React.createElement("span", {
    className: "dk-mono",
    style: {
      fontSize: 11
    }
  }, a.meta)), /*#__PURE__*/React.createElement("button", {
    onClick: a.go,
    style: {
      flex: 'none',
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      padding: '3px 10px',
      borderRadius: 'var(--radius-xs)',
      cursor: 'pointer',
      border: '1px solid var(--border-default)',
      background: 'none',
      color: 'var(--text-body)'
    }
  }, a.action))), attention.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "dk-meta__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dk-mono"
  }, "Nothing needs you right now.")))), /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement("div", {
    className: "dk-sec-h"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "compass",
    size: 14
  }), " Active trails"), /*#__PURE__*/React.createElement("table", {
    className: "dk-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      width: 100
    }
  }, "Trail"), /*#__PURE__*/React.createElement("th", null, "Title"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 190
    }
  }, "Waypoints"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 110
    }
  }, "Claimed"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 80
    }
  }, "Updated"))), /*#__PURE__*/React.createElement("tbody", null, activeTrails.map(t => /*#__PURE__*/React.createElement("tr", {
    key: t.id,
    onClick: () => onOpenTrail(t.id)
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    className: "dk-id"
  }, t.id)), /*#__PURE__*/React.createElement("td", {
    className: "dk-strong"
  }, t.title), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 64,
      height: 4,
      borderRadius: 2,
      background: 'var(--bg-inset)',
      overflow: 'hidden',
      flex: 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${Math.round(t.reached / t.total * 100)}%`,
      height: '100%',
      background: 'var(--green-400)'
    }
  })), /*#__PURE__*/React.createElement("span", {
    className: "dk-mono"
  }, t.reached, "/", t.total), t.stuck > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--amber-400)',
      display: 'inline-flex'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "triangle-alert",
    size: 12
  })))), /*#__PURE__*/React.createElement("td", {
    className: "dk-mono"
  }, t.claimed ? `${t.claimed} claimed` : '—'), /*#__PURE__*/React.createElement("td", {
    className: "dk-mono"
  }, t.updated)))))), /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement("div", {
    className: "dk-sec-h"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "file-text",
    size: 14
  }), " Pipeline \xB7 in review"), /*#__PURE__*/React.createElement("table", {
    className: "dk-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      width: 70
    }
  }, "Spec"), /*#__PURE__*/React.createElement("th", null, "Title"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 110
    }
  }, "Stage"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 160
    }
  }, "Actor"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 80
    }
  }, "Updated"))), /*#__PURE__*/React.createElement("tbody", null, inReview.map(s => /*#__PURE__*/React.createElement("tr", {
    key: s.id,
    onClick: () => onOpenSpec(s.id)
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    className: "dk-id"
  }, "#", s.id)), /*#__PURE__*/React.createElement("td", {
    className: "dk-strong"
  }, s.title), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    className: "dk-node"
  }, s.stage)), /*#__PURE__*/React.createElement("td", {
    className: "dk-mono"
  }, s.actor), /*#__PURE__*/React.createElement("td", {
    className: "dk-mono"
  }, s.updated))))))), /*#__PURE__*/React.createElement("aside", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 22
    }
  }, /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement("div", {
    className: "dk-sec-h"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "activity",
    size: 14
  }), " Live runs"), /*#__PURE__*/React.createElement("div", {
    className: "dk-meta"
  }, d.runs.filter(r => r.status === 'running' || r.status === 'in_review').map(r => /*#__PURE__*/React.createElement("div", {
    key: r.id,
    className: "dk-meta__row",
    style: {
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "dk-mono",
    style: {
      display: 'block',
      color: 'var(--text-strong)'
    }
  }, r.node), /*#__PURE__*/React.createElement("span", {
    className: "dk-mono",
    style: {
      fontSize: 11
    }
  }, r.id, " \xB7 ", r.started)), /*#__PURE__*/React.createElement(StatusBadge, {
    status: r.status
  }))))), /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement("div", {
    className: "dk-sec-h"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "scroll-text",
    size: 14
  }), " Recent activity"), /*#__PURE__*/React.createElement("div", {
    className: "dk-meta"
  }, d.audit.slice(0, 6).map((a, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "dk-meta__row",
    style: {
      gap: 10,
      alignItems: 'flex-start'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "dk-mono",
    style: {
      flex: 'none',
      fontSize: 11,
      paddingTop: 1
    }
  }, a.ts), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 12.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "dk-strong"
  }, a.actor), " ", /*#__PURE__*/React.createElement("span", {
    className: "dk-mono",
    style: {
      color: 'var(--green-300)'
    }
  }, a.action)), /*#__PURE__*/React.createElement("span", {
    className: "dk-mono",
    style: {
      fontSize: 11
    }
  }, a.table, " \xB7 ", a.row))))), /*#__PURE__*/React.createElement("button", {
    onClick: () => onNavigate({
      screen: 'audit'
    }),
    style: {
      marginTop: 8,
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      border: 'none',
      background: 'none',
      cursor: 'pointer',
      color: 'var(--text-link)',
      padding: 0,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-right",
    size: 12
  }), " full audit log")))));
}
Object.assign(window, {
  DashboardScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/DashboardScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/RunDetailScreen.jsx
try { (() => {
const {
  StatusBadge,
  Badge,
  Button,
  Icon,
  Dialog,
  Textarea
} = window.RelentlessDesignSystem_81cf11;
const NODE_KIND = {
  agent: {
    icon: 'cpu',
    tone: 'accent'
  },
  human: {
    icon: 'user-round',
    tone: 'info'
  },
  guard: {
    icon: 'shield-check',
    tone: 'success'
  },
  script: {
    icon: 'terminal',
    tone: 'neutral'
  }
};
const NODE_STATE = {
  done: {
    color: 'var(--green-400)',
    icon: 'circle-check'
  },
  running: {
    color: 'var(--text-brand)',
    icon: 'loader'
  },
  waiting: {
    color: 'var(--amber-400)',
    icon: 'circle-pause'
  },
  denied: {
    color: 'var(--status-denied-fg)',
    icon: 'circle-x'
  },
  pending: {
    color: 'var(--text-faint)',
    icon: 'circle-dashed'
  }
};
function RunDetailScreen({
  runId,
  onToast
}) {
  const run = window.RL_DATA.runDetails[runId] || window.RL_DATA.runDetails['run_5c18'];
  const [denyOpen, setDenyOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [resolved, setResolved] = React.useState(null); // 'approve' | 'deny'
  const approve = () => {
    setResolved('approve');
    onToast({
      tone: 'success',
      title: 'Signal sent · approve',
      message: `${run.gate.node} resolved — scheduler resumes at design.compile.`
    });
  };
  const confirmDeny = () => {
    setDenyOpen(false);
    setResolved('deny');
    onToast({
      tone: 'danger',
      title: 'Signal sent · deny',
      message: 'Reason returned to requirements-compiler for redraft.'
    });
  };
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "dk-page-h",
    style: {
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "dk-id",
    style: {
      fontSize: 14
    }
  }, run.id), " ", run.workflow), /*#__PURE__*/React.createElement(StatusBadge, {
    status: resolved ? resolved === 'approve' ? 'approved' : 'denied' : run.status
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto'
    },
    className: "dk-mono"
  }, "started ", run.started, run.ended ? ` · ended ${run.ended}` : '')), /*#__PURE__*/React.createElement("div", {
    className: "dk-detail"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 22,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement("div", {
    className: "dk-sec-h"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "waypoints",
    size: 14
  }), " Nodes"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 0,
      overflowX: 'auto',
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-md)',
      padding: '14px 16px'
    }
  }, run.nodes.map((n, i) => {
    const s = NODE_STATE[n.status],
      k = NODE_KIND[n.kind];
    const active = n.status === 'waiting' || n.status === 'running';
    const borderColor = n.status === 'waiting' ? 'var(--amber-400)' : n.status === 'running' ? 'var(--accent)' : n.status === 'denied' ? 'var(--status-denied-fg)' : 'var(--border-subtle)';
    return /*#__PURE__*/React.createElement(React.Fragment, {
      key: n.id
    }, i > 0 && /*#__PURE__*/React.createElement("span", {
      style: {
        alignSelf: 'center',
        width: 26,
        height: 1,
        background: 'var(--border-strong)',
        flex: 'none',
        margin: '0 6px'
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
        alignItems: 'flex-start',
        flex: 'none',
        padding: '8px 10px',
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${borderColor}`,
        background: active ? 'var(--bg-surface-2)' : 'transparent'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: s.color
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: s.icon,
      size: 13
    }), " ", n.status, n.dur ? ` · ${n.dur}` : ''), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        color: 'var(--text-strong)'
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: k.icon,
      size: 13
    }), " ", n.id)));
  }))), /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement("div", {
    className: "dk-sec-h"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "package",
    size: 14
  }), " Artifacts"), /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: 'auto',
      borderRadius: 'var(--radius-md)'
    }
  }, /*#__PURE__*/React.createElement("table", {
    className: "dk-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Name"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 70
    }
  }, "Ver"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 200
    }
  }, "Authoring node"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 110
    }
  }, "Hash"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 90
    }
  }, "Written"))), /*#__PURE__*/React.createElement("tbody", null, run.artifacts.map(a => /*#__PURE__*/React.createElement("tr", {
    key: a.name,
    style: {
      cursor: 'default'
    }
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    className: "dk-strong",
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 13
    }
  }, a.name)), /*#__PURE__*/React.createElement("td", {
    className: "dk-mono"
  }, "v", a.version), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    className: "dk-node"
  }, a.node)), /*#__PURE__*/React.createElement("td", {
    className: "dk-mono"
  }, a.hash), /*#__PURE__*/React.createElement("td", {
    className: "dk-mono"
  }, a.ts))))))), /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement("div", {
    className: "dk-sec-h"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "scroll-text",
    size: 14
  }), " Run events"), /*#__PURE__*/React.createElement("div", {
    className: "dk-meta"
  }, run.events.map(e => /*#__PURE__*/React.createElement("div", {
    key: e.seq,
    className: "dk-meta__row",
    style: {
      gap: 12,
      alignItems: 'flex-start'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "dk-mono",
    style: {
      flex: 'none',
      fontSize: 11,
      width: 24,
      textAlign: 'right'
    }
  }, e.seq), /*#__PURE__*/React.createElement("span", {
    className: "dk-mono",
    style: {
      flex: 'none',
      fontSize: 11
    }
  }, e.ts), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "dk-mono",
    style: {
      display: 'block',
      color: 'var(--green-300)',
      fontSize: 12
    }
  }, e.type), /*#__PURE__*/React.createElement("span", {
    className: "dk-mono",
    style: {
      fontSize: 11
    }
  }, e.detail))))))), /*#__PURE__*/React.createElement("aside", {
    className: "dk-aside"
  }, run.gate && /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--bg-surface)',
      border: `1px solid ${resolved ? 'var(--border-default)' : 'var(--amber-400)'}`,
      borderRadius: 'var(--radius-md)',
      padding: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "dk-meta__k",
    style: {
      marginBottom: 10,
      display: 'flex',
      alignItems: 'center',
      gap: 7
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "user-round",
    size: 14
  }), " Human gate \xB7 ", run.gate.node), resolved ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 13,
      color: 'var(--text-muted)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: resolved === 'approve' ? 'circle-check' : 'circle-x',
    size: 16,
    color: resolved === 'approve' ? 'var(--green-400)' : 'var(--danger)'
  }), "Resolved \xB7 ", resolved) : /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-muted)',
      margin: '0 0 4px',
      lineHeight: 1.5
    }
  }, run.gate.prompt), /*#__PURE__*/React.createElement("span", {
    className: "dk-mono",
    style: {
      fontSize: 11,
      color: 'var(--text-faint)'
    }
  }, "allowed signals: ", run.gate.allowedSignals.join(' | '), " \xB7 deadline: ", run.gate.deadline || 'none'), /*#__PURE__*/React.createElement(Button, {
    variant: "success",
    icon: "check",
    block: true,
    onClick: approve
  }, "Approve"), /*#__PURE__*/React.createElement(Button, {
    variant: "danger",
    icon: "x",
    block: true,
    onClick: () => setDenyOpen(true)
  }, "Deny\u2026"))), run.executing && /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--bg-surface)',
      border: '1px solid var(--accent)',
      borderRadius: 'var(--radius-md)',
      padding: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "dk-meta__k",
    style: {
      marginBottom: 8,
      display: 'flex',
      alignItems: 'center',
      gap: 7
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "loader",
    size: 14
  }), " Executing \xB7 ", run.executing.node), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-muted)',
      margin: 0,
      lineHeight: 1.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "dk-mono",
    style: {
      color: 'var(--text-body)'
    }
  }, run.executing.agent), " (", run.executing.model, ") has held this node for ", run.executing.elapsed, ". No signal needed \u2014 the scheduler advances on exit.")), run.resolvedGate && /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--bg-surface)',
      border: '1px solid var(--status-denied-fg)',
      borderRadius: 'var(--radius-md)',
      padding: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "dk-meta__k",
    style: {
      marginBottom: 8,
      display: 'flex',
      alignItems: 'center',
      gap: 7
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "circle-x",
    size: 14
  }), " Gate resolved \xB7 ", run.resolvedGate.node), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-muted)',
      margin: 0,
      lineHeight: 1.5
    }
  }, "Signal ", /*#__PURE__*/React.createElement("span", {
    className: "dk-mono",
    style: {
      color: 'var(--status-denied-fg)'
    }
  }, run.resolvedGate.signal), " by ", /*#__PURE__*/React.createElement("span", {
    className: "dk-mono"
  }, run.resolvedGate.by), " \xB7 ", run.resolvedGate.ts), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-muted)',
      margin: '8px 0 0',
      lineHeight: 1.5
    }
  }, "\u201C", run.resolvedGate.payload, "\u201D")), run.summary && /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-md)',
      padding: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "dk-meta__k",
    style: {
      marginBottom: 8,
      display: 'flex',
      alignItems: 'center',
      gap: 7
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "circle-check",
    size: 14
  }), " ", run.summary.headline), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-muted)',
      margin: 0,
      lineHeight: 1.5
    }
  }, run.summary.detail)), /*#__PURE__*/React.createElement("div", {
    className: "dk-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dk-meta__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dk-meta__k"
  }, "Workflow"), /*#__PURE__*/React.createElement("span", {
    className: "dk-mono"
  }, run.workflow)), /*#__PURE__*/React.createElement("div", {
    className: "dk-meta__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dk-meta__k"
  }, "Snapshot"), /*#__PURE__*/React.createElement("span", {
    className: "dk-mono"
  }, run.snapshot)), /*#__PURE__*/React.createElement("div", {
    className: "dk-meta__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dk-meta__k"
  }, "Claimed by"), /*#__PURE__*/React.createElement("span", {
    className: "dk-mono"
  }, run.claimedBy)), /*#__PURE__*/React.createElement("div", {
    className: "dk-meta__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dk-meta__k"
  }, "Workspace"), /*#__PURE__*/React.createElement("span", {
    className: "dk-mono",
    style: {
      fontSize: 11
    }
  }, run.workspace)), /*#__PURE__*/React.createElement("div", {
    className: "dk-meta__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dk-meta__k"
  }, "Started"), /*#__PURE__*/React.createElement("span", {
    className: "dk-mono"
  }, run.started))))), /*#__PURE__*/React.createElement(Dialog, {
    open: denyOpen,
    onClose: () => setDenyOpen(false),
    title: "Deny \xB7 requirements.gate",
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      onClick: () => setDenyOpen(false)
    }, "Cancel"), /*#__PURE__*/React.createElement(Button, {
      variant: "danger",
      icon: "x",
      onClick: confirmDeny
    }, "Send deny signal"))
  }, /*#__PURE__*/React.createElement(Textarea, {
    label: "Reason",
    value: reason,
    onChange: e => setReason(e.target.value),
    rows: 3,
    hint: "Returned as the resolved_payload \u2014 the drafting agent incorporates it on redraft."
  })));
}
Object.assign(window, {
  RunDetailScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/RunDetailScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/RunsScreen.jsx
try { (() => {
const {
  StatusBadge,
  Badge,
  Icon
} = window.RelentlessDesignSystem_81cf11;
const KIND_TONE = {
  agent: 'accent',
  human: 'info',
  guard: 'success',
  script: 'neutral'
};
const KIND_ICON = {
  agent: 'cpu',
  human: 'user-round',
  guard: 'shield-check',
  script: 'terminal'
};
function RunsScreen({
  onOpen
}) {
  const runs = window.RL_DATA.runs;
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "dk-page-h"
  }, /*#__PURE__*/React.createElement("h1", null, "Runs"), /*#__PURE__*/React.createElement("span", {
    className: "dk-page-sub"
  }, "Generic workflow engine \xB7 scheduler claims runnable runs and drives the interpreter node-by-node")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginBottom: 18,
      flexWrap: 'wrap'
    }
  }, Object.keys(KIND_TONE).map(k => /*#__PURE__*/React.createElement("span", {
    key: k,
    className: "dk-node"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: KIND_ICON[k],
    size: 13
  }), " ", k))), /*#__PURE__*/React.createElement("table", {
    className: "dk-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      width: 130
    }
  }, "Run"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 170
    }
  }, "Workflow"), /*#__PURE__*/React.createElement("th", null, "Node"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 100
    }
  }, "Kind"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 120
    }
  }, "Status"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 150
    }
  }, "Executor"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 90
    }
  }, "Started"))), /*#__PURE__*/React.createElement("tbody", null, runs.map(r => /*#__PURE__*/React.createElement("tr", {
    key: r.id,
    onClick: () => onOpen && onOpen(r.id)
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    className: "dk-id"
  }, r.id)), /*#__PURE__*/React.createElement("td", {
    className: "dk-mono"
  }, r.workflow), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    className: "dk-node"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "box",
    size: 13
  }), " ", r.node)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(Badge, {
    tone: KIND_TONE[r.kind]
  }, r.kind)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(StatusBadge, {
    status: r.status
  })), /*#__PURE__*/React.createElement("td", {
    className: "dk-mono"
  }, r.executor), /*#__PURE__*/React.createElement("td", {
    className: "dk-mono"
  }, r.started))))));
}
Object.assign(window, {
  RunsScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/RunsScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/Sidebar.jsx
try { (() => {
const {
  Icon
} = window.RelentlessDesignSystem_81cf11;
function Sidebar({
  route,
  onNavigate,
  collapsed,
  onToggle,
  project,
  onProject
}) {
  const [projOpen, setProjOpen] = React.useState(false);
  const projects = window.RL_DATA.projects;
  const specCount = window.RL_DATA.specs.length;
  const runCount = window.RL_DATA.runs.filter(r => r.status === 'running' || r.status === 'in_review').length;
  const trailCount = window.RL_DATA.trails.filter(t => t.status === 'active').length;
  const groups = [{
    label: 'Overview',
    items: [{
      key: 'home',
      label: 'Home',
      icon: 'layout-dashboard'
    }]
  }, {
    label: 'Discovery',
    items: [{
      key: 'trails',
      label: 'Trails',
      icon: 'compass',
      count: trailCount
    }]
  }, {
    label: 'Pipeline',
    items: [{
      key: 'specs',
      label: 'Specs',
      icon: 'file-text',
      count: specCount
    }, {
      key: 'runs',
      label: 'Runs',
      icon: 'play',
      count: runCount
    }]
  }, {
    label: 'System',
    items: [{
      key: 'audit',
      label: 'Audit log',
      icon: 'scroll-text'
    }, {
      key: 'actors',
      label: 'Actors',
      icon: 'user-round-cog'
    }]
  }];
  const isActive = k => route.screen === k || k === 'specs' && route.screen === 'detail' || k === 'trails' && route.screen === 'trail';
  return /*#__PURE__*/React.createElement("aside", {
    className: `dk-side ${collapsed ? 'dk-side--collapsed' : ''}`
  }, /*#__PURE__*/React.createElement("button", {
    className: "dk-brand",
    onClick: () => onNavigate({
      screen: 'home'
    }),
    title: "Home"
  }, /*#__PURE__*/React.createElement("span", {
    className: "g"
  }), !collapsed && /*#__PURE__*/React.createElement("span", {
    className: "w"
  }, "Rig")), /*#__PURE__*/React.createElement("div", {
    className: "dk-proj-wrap"
  }, /*#__PURE__*/React.createElement("button", {
    className: "dk-proj",
    onClick: () => setProjOpen(o => !o),
    title: collapsed ? `Project · ${project.name}` : undefined
  }, /*#__PURE__*/React.createElement("span", {
    className: "dk-proj__mark"
  }, project.name[0]), !collapsed && /*#__PURE__*/React.createElement("span", {
    className: "dk-proj__name"
  }, project.name), !collapsed && /*#__PURE__*/React.createElement(Icon, {
    name: "chevrons-up-down",
    size: 14,
    style: {
      marginLeft: 'auto',
      color: 'var(--text-faint)'
    }
  })), projOpen && /*#__PURE__*/React.createElement("div", {
    className: "dk-proj__menu"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dk-side__label",
    style: {
      padding: '4px 10px 6px'
    }
  }, "Projects"), projects.map(p => /*#__PURE__*/React.createElement("button", {
    key: p.slug,
    className: `dk-proj__item ${p.slug === project.slug ? 'dk-proj__item--active' : ''}`,
    onClick: () => {
      setProjOpen(false);
      onProject(p);
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "dk-proj__mark"
  }, p.name[0]), /*#__PURE__*/React.createElement("span", {
    style: {
      minWidth: 0,
      flex: 1,
      textAlign: 'left'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--text-strong)'
    }
  }, p.name), /*#__PURE__*/React.createElement("span", {
    className: "dk-mono",
    style: {
      fontSize: 10.5,
      color: 'var(--text-faint)'
    }
  }, p.slug, " \xB7 ", p.specs, " specs \xB7 ", p.trails, " trails")), p.slug === project.slug && /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 14,
    style: {
      color: 'var(--green-400)',
      flex: 'none'
    }
  }))))), groups.map(g => /*#__PURE__*/React.createElement(React.Fragment, {
    key: g.label
  }, collapsed ? /*#__PURE__*/React.createElement("div", {
    className: "dk-side__rule"
  }) : /*#__PURE__*/React.createElement("div", {
    className: "dk-side__label"
  }, g.label), g.items.map(n => /*#__PURE__*/React.createElement("button", {
    key: n.key,
    className: `dk-nav ${isActive(n.key) ? 'dk-nav--active' : ''}`,
    onClick: () => onNavigate({
      screen: n.key
    }),
    title: collapsed ? n.label : undefined
  }, /*#__PURE__*/React.createElement(Icon, {
    name: n.icon,
    size: 17
  }), !collapsed && n.label, !collapsed && n.count != null && /*#__PURE__*/React.createElement("span", {
    className: "dk-nav__count"
  }, n.count))))), /*#__PURE__*/React.createElement("div", {
    className: "dk-side__foot"
  }, !collapsed && /*#__PURE__*/React.createElement("div", {
    className: "dk-exec"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "cpu",
    size: 15
  }), " executor \xB7 claude"), /*#__PURE__*/React.createElement("button", {
    className: "dk-nav",
    onClick: onToggle,
    title: collapsed ? 'Expand sidebar' : 'Collapse sidebar'
  }, /*#__PURE__*/React.createElement(Icon, {
    name: collapsed ? 'panel-left-open' : 'panel-left-close',
    size: 17
  }), !collapsed && 'Collapse')));
}
Object.assign(window, {
  Sidebar
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/Sidebar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/SpecDetailScreen.jsx
try { (() => {
const {
  Tabs,
  StageStepper,
  StatusBadge,
  Badge,
  Button,
  Icon,
  Dialog,
  Textarea
} = window.RelentlessDesignSystem_81cf11;
const STAGE_ORDER = ['requirements', 'design', 'tasks'];
function SpecDetailScreen({
  specId,
  onToast
}) {
  const spec = window.RL_DATA.specs.find(s => s.id === specId) || window.RL_DATA.specs[0];
  const idx = STAGE_ORDER.indexOf(spec.stage);
  const stages = window.RL_DATA.stages.map((st, i) => ({
    ...st,
    status: i < idx ? 'approved' : i === idx ? spec.status : 'not_started'
  }));
  const activeStage = stages[idx];
  const [tab, setTab] = React.useState(spec.stage);
  const [denyOpen, setDenyOpen] = React.useState(false);
  const [reason, setReason] = React.useState(spec.denialReason || '');
  const [resolved, setResolved] = React.useState(null); // 'approved' | 'denied'
  const trail = window.RL_DATA.trails.find(t => t.spec === spec.id);
  const approve = () => {
    setResolved('approved');
    onToast({
      tone: 'success',
      title: 'Stage approved',
      message: `${activeStage.label} → ${stages[idx + 1] ? stages[idx + 1].label : 'done'}`
    });
  };
  const confirmDeny = () => {
    setDenyOpen(false);
    setResolved('denied');
    onToast({
      tone: 'danger',
      title: 'Denied',
      message: `${activeStage.agent} redrafting…`
    });
  };
  const drafted = k => {
    const i = STAGE_ORDER.indexOf(k);
    return i < idx || i === idx && spec.status !== 'not_started';
  };
  const headerStatus = resolved || spec.status;
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "dk-id",
    style: {
      fontSize: 13
    }
  }, "#", spec.id), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 24
    }
  }, spec.title), /*#__PURE__*/React.createElement("span", {
    className: "dk-mono",
    style: {
      fontSize: 12,
      color: 'var(--text-faint)'
    }
  }, spec.slug), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto'
    }
  }), /*#__PURE__*/React.createElement(StatusBadge, {
    status: headerStatus === 'not_started' ? 'draft' : headerStatus,
    label: headerStatus
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement(StageStepper, {
    current: idx
  })), spec.status === 'denied' && !resolved && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      background: 'var(--bg-surface)',
      border: '1px solid var(--status-denied-fg)',
      borderRadius: 'var(--radius-md)',
      padding: '12px 16px',
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "circle-x",
    size: 16,
    color: "var(--status-denied-fg)",
    style: {
      flex: 'none',
      marginTop: 1
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      lineHeight: 1.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "dk-strong",
    style: {
      display: 'block'
    }
  }, activeStage.label, " denied \xB7 ", spec.updated), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-muted)'
    }
  }, "\u201C", spec.denialReason, "\u201D \u2014 returned to ", /*#__PURE__*/React.createElement("span", {
    className: "dk-mono",
    style: {
      color: 'var(--text-body)'
    }
  }, activeStage.agent), " for redraft."))), /*#__PURE__*/React.createElement("div", {
    className: "dk-detail"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Tabs, {
    value: tab,
    onChange: setTab,
    items: [{
      value: 'requirements',
      label: 'Requirements',
      icon: 'list-checks'
    }, {
      value: 'design',
      label: 'Design',
      icon: 'drafting-compass'
    }, {
      value: 'tasks',
      label: 'Tasks',
      icon: 'list-todo'
    }, {
      value: 'impl',
      label: 'Implementation',
      icon: 'code'
    }]
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16
    }
  }, tab === 'requirements' && (drafted('requirements') ? /*#__PURE__*/React.createElement(RequirementsDoc, null) : /*#__PURE__*/React.createElement(EmptyDoc, {
    stage: "requirements",
    agent: "requirements-compiler",
    note: trail ? undefined : 'Waits on the linked discovery trail’s reached waypoints.'
  })), tab === 'design' && (drafted('design') ? /*#__PURE__*/React.createElement(DesignDoc, null) : /*#__PURE__*/React.createElement(EmptyDoc, {
    stage: "design",
    agent: "design-drafter"
  })), tab === 'tasks' && (drafted('tasks') ? /*#__PURE__*/React.createElement(TasksDoc, {
    done: spec.tasks > 0 ? 2 : 0,
    total: spec.tasks || 5
  }) : /*#__PURE__*/React.createElement(EmptyDoc, {
    stage: "tasks",
    agent: "tasks-drafter"
  })), tab === 'impl' && (spec.tasks > 0 ? /*#__PURE__*/React.createElement(ImplDoc, null) : /*#__PURE__*/React.createElement(EmptyDoc, {
    stage: "implementation",
    agent: "spec-implementation-orchestrator",
    note: "Dispatches task-by-task once tasks are approved."
  })))), /*#__PURE__*/React.createElement("aside", {
    className: "dk-aside"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-md)',
      padding: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "dk-meta__k",
    style: {
      marginBottom: 10
    }
  }, "Human review gate"), resolved ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 13,
      color: 'var(--text-muted)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: resolved === 'approved' ? 'circle-check' : 'circle-x',
    size: 16,
    color: resolved === 'approved' ? 'var(--green-400)' : 'var(--danger)'
  }), "Stage ", resolved) : spec.status === 'in_review' ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-muted)',
      margin: '0 0 4px',
      lineHeight: 1.5
    }
  }, activeStage.label, " is in review. Approve to advance, or deny with a reason."), /*#__PURE__*/React.createElement(Button, {
    variant: "success",
    icon: "check",
    block: true,
    onClick: approve
  }, "Approve"), /*#__PURE__*/React.createElement(Button, {
    variant: "danger",
    icon: "x",
    block: true,
    onClick: () => setDenyOpen(true)
  }, "Deny\u2026")) : spec.status === 'denied' ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 8,
      fontSize: 12.5,
      color: 'var(--text-muted)',
      lineHeight: 1.5
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "loader",
    size: 15,
    color: "var(--status-denied-fg)",
    style: {
      flex: 'none',
      marginTop: 2
    }
  }), /*#__PURE__*/React.createElement("span", null, "Denied \u2014 ", /*#__PURE__*/React.createElement("span", {
    className: "dk-mono"
  }, activeStage.agent), " is redrafting. The gate reopens on the next finalize_stage.")) : spec.status === 'approved' ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 8,
      fontSize: 12.5,
      color: 'var(--text-muted)',
      lineHeight: 1.5
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "circle-check",
    size: 15,
    color: "var(--green-400)",
    style: {
      flex: 'none',
      marginTop: 2
    }
  }), /*#__PURE__*/React.createElement("span", null, activeStage.label, " approved. ", stages[idx + 1] ? /*#__PURE__*/React.createElement(React.Fragment, null, "Next: ", /*#__PURE__*/React.createElement("span", {
    className: "dk-mono"
  }, stages[idx + 1].key), " \xB7 not started.") : 'Implementation dispatches task-by-task.')) : /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 8,
      fontSize: 12.5,
      color: 'var(--text-muted)',
      lineHeight: 1.5
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "circle-dashed",
    size: 15,
    color: "var(--text-faint)",
    style: {
      flex: 'none',
      marginTop: 2
    }
  }), /*#__PURE__*/React.createElement("span", null, "Nothing to review \u2014 ", /*#__PURE__*/React.createElement("span", {
    className: "dk-mono"
  }, activeStage.agent), " hasn\u2019t finalized this stage."))), /*#__PURE__*/React.createElement("div", {
    className: "dk-meta"
  }, /*#__PURE__*/React.createElement(Row, {
    k: "Stage",
    v: /*#__PURE__*/React.createElement("span", {
      className: "dk-mono"
    }, activeStage.key)
  }), /*#__PURE__*/React.createElement(Row, {
    k: "Agent",
    v: /*#__PURE__*/React.createElement("span", {
      className: "dk-mono",
      style: {
        color: 'var(--text-body)'
      }
    }, activeStage.agent)
  }), /*#__PURE__*/React.createElement(Row, {
    k: "Model",
    v: /*#__PURE__*/React.createElement(Badge, {
      tone: "accent"
    }, activeStage.model)
  }), /*#__PURE__*/React.createElement(Row, {
    k: "Reqs",
    v: /*#__PURE__*/React.createElement("span", {
      className: "dk-mono"
    }, spec.reqs)
  }), /*#__PURE__*/React.createElement(Row, {
    k: "Tasks",
    v: /*#__PURE__*/React.createElement("span", {
      className: "dk-mono"
    }, spec.tasks)
  }), /*#__PURE__*/React.createElement(Row, {
    k: "Updated",
    v: /*#__PURE__*/React.createElement("span", {
      className: "dk-mono"
    }, spec.updated)
  })), /*#__PURE__*/React.createElement("div", {
    className: "dk-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dk-meta__row",
    style: {
      borderBottom: '1px solid var(--border-subtle)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "dk-meta__k"
  }, "Discovery trail")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '10px 14px',
      fontSize: 12.5,
      color: 'var(--text-muted)',
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "compass",
    size: 15
  }), " ", trail ? `${trail.id} · ${trail.reached} reached → this spec` : 'no linked trail')))), /*#__PURE__*/React.createElement(Dialog, {
    open: denyOpen,
    onClose: () => setDenyOpen(false),
    title: `Deny ${activeStage.label.toLowerCase()} stage`,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      onClick: () => setDenyOpen(false)
    }, "Cancel"), /*#__PURE__*/React.createElement(Button, {
      variant: "danger",
      icon: "x",
      onClick: confirmDeny
    }, "Deny & redraft"))
  }, /*#__PURE__*/React.createElement(Textarea, {
    label: "Denial reason",
    value: reason,
    onChange: e => setReason(e.target.value),
    rows: 3,
    hint: "Returned to the drafting agent to incorporate on redraft."
  })));
}
function EmptyDoc({
  stage,
  agent,
  note
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      border: '1px dashed var(--border-default)',
      borderRadius: 'var(--radius-md)',
      padding: '36px 24px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "circle-dashed",
    size: 22,
    color: "var(--text-faint)"
  }), /*#__PURE__*/React.createElement("span", {
    className: "dk-strong",
    style: {
      fontSize: 13.5
    }
  }, "No ", stage, " yet"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-muted)',
      maxWidth: 380,
      lineHeight: 1.5
    }
  }, note || /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
    className: "dk-mono"
  }, agent), " drafts this stage and submits it with finalize_stage.")));
}
function Row({
  k,
  v
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "dk-meta__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dk-meta__k"
  }, k), /*#__PURE__*/React.createElement("span", null, v));
}
function DesignDoc() {
  return /*#__PURE__*/React.createElement("div", {
    className: "dk-md"
  }, /*#__PURE__*/React.createElement("h2", null, "Architecture"), /*#__PURE__*/React.createElement("p", null, "The logging pipeline runs as a ", /*#__PURE__*/React.createElement("b", null, "scheduler-driven"), " subgraph of ", /*#__PURE__*/React.createElement("code", null, "rig-default"), ". Each spec stage is a node that reads the prior artifact and writes the next, gated by a human ", /*#__PURE__*/React.createElement("code", null, "review"), " node."), /*#__PURE__*/React.createElement("h3", null, "Components"), /*#__PURE__*/React.createElement("ul", null, /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("b", null, "Collector"), " \u2014 batches structured events, flushes to Postgres ", /*#__PURE__*/React.createElement("code", null, "audit_log"), "."), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("b", null, "Renderer"), " \u2014 materializes markdown from ", /*#__PURE__*/React.createElement("code", null, "spec_pipeline"), " rows on demand."), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("b", null, "Guard"), " \u2014 validates ", /*#__PURE__*/React.createElement("code", null, "actor"), " against ", /*#__PURE__*/React.createElement("code", null, "known_actors"), " before any write.")), /*#__PURE__*/React.createElement("h3", null, "Traceability"), /*#__PURE__*/React.createElement("table", null, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Requirement"), /*#__PURE__*/React.createElement("th", null, "Component"), /*#__PURE__*/React.createElement("th", null, "Covered"))), /*#__PURE__*/React.createElement("tbody", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "REQ-011 \xB7 every write attributed"), /*#__PURE__*/React.createElement("td", null, "Guard"), /*#__PURE__*/React.createElement("td", null, "yes")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "REQ-014 \xB7 audit row per mutation"), /*#__PURE__*/React.createElement("td", null, "Collector"), /*#__PURE__*/React.createElement("td", null, "partial")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, "REQ-018 \xB7 render on demand"), /*#__PURE__*/React.createElement("td", null, "Renderer"), /*#__PURE__*/React.createElement("td", null, "yes")))), /*#__PURE__*/React.createElement("h3", null, "Risks"), /*#__PURE__*/React.createElement("ul", null, /*#__PURE__*/React.createElement("li", null, "Back-pressure when the scheduler claims faster than the collector flushes."), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("code", null, "REQ-014"), " lacks an explicit rollback path if the audit insert fails mid-transaction.")));
}
function RequirementsDoc() {
  return /*#__PURE__*/React.createElement("div", {
    className: "dk-md"
  }, /*#__PURE__*/React.createElement("h2", null, "User stories"), /*#__PURE__*/React.createElement("ul", null, /*#__PURE__*/React.createElement("li", null, "As an operator, I want every mutation attributed to a registered actor so writes are auditable."), /*#__PURE__*/React.createElement("li", null, "As a reviewer, I want each stage rendered as markdown so I can approve or deny it.")), /*#__PURE__*/React.createElement("h3", null, "Acceptance criteria (EARS)"), /*#__PURE__*/React.createElement("ul", null, /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("code", null, "WHEN"), " a write is attempted ", /*#__PURE__*/React.createElement("code", null, "WHERE"), " actor \u2209 known_actors, the system ", /*#__PURE__*/React.createElement("code", null, "SHALL"), " reject it."), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("code", null, "WHILE"), " a stage is in_review, the system ", /*#__PURE__*/React.createElement("code", null, "SHALL"), " block auto-advance.")), /*#__PURE__*/React.createElement("h3", null, "Non-goals"), /*#__PURE__*/React.createElement("ul", null, /*#__PURE__*/React.createElement("li", null, "Real-time streaming of partial artifacts to the reviewer.")));
}
function TasksDoc({
  done = 2,
  total = 5
}) {
  const tasks = [{
    t: 'Add collector batch flush + backoff',
    batch: 'A'
  }, {
    t: 'Renderer: materialize markdown from rows',
    batch: 'A'
  }, {
    t: 'Guard: validate actor on every write path',
    batch: 'B'
  }, {
    t: 'Wire audit_log insert into write transaction',
    batch: 'B'
  }, {
    t: 'Traceability check REQ-014 rollback',
    batch: 'C'
  }].map((x, i) => ({
    ...x,
    done: i < done
  }));
  return /*#__PURE__*/React.createElement("div", {
    className: "dk-md"
  }, /*#__PURE__*/React.createElement("h2", null, "Tasks \xB7 ", done, " of ", total, " done"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, tasks.map((x, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '9px 12px',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-sm)',
      background: 'var(--bg-surface-2)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: x.done ? 'circle-check' : 'circle-dashed',
    size: 16,
    color: x.done ? 'var(--emerald-500)' : 'var(--text-faint)'
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13.5,
      color: x.done ? 'var(--text-muted)' : 'var(--text-strong)',
      textDecoration: x.done ? 'line-through' : 'none'
    }
  }, x.t), /*#__PURE__*/React.createElement(Badge, {
    tone: "outline",
    style: {
      marginLeft: 'auto'
    }
  }, "batch ", x.batch)))));
}
function ImplDoc() {
  return /*#__PURE__*/React.createElement("div", {
    className: "dk-md"
  }, /*#__PURE__*/React.createElement("h2", null, "Implementation"), /*#__PURE__*/React.createElement("p", null, "Dispatched by ", /*#__PURE__*/React.createElement("code", null, "spec-implementation-orchestrator"), " (haiku) to ", /*#__PURE__*/React.createElement("code", null, "code-implementer"), ", ", /*#__PURE__*/React.createElement("code", null, "test-writer"), ", and ", /*#__PURE__*/React.createElement("code", null, "code-reviewer"), ", task-by-task."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "success"
  }, "14 files changed"), /*#__PURE__*/React.createElement(Badge, {
    tone: "info"
  }, "22 tasks"), /*#__PURE__*/React.createElement(Badge, {
    tone: "accent"
  }, "haiku")));
}
Object.assign(window, {
  SpecDetailScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/SpecDetailScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/SpecsScreen.jsx
try { (() => {
const {
  StatusBadge,
  StageStepper,
  Badge,
  Icon
} = window.RelentlessDesignSystem_81cf11;
const STAGE_NAMES = {
  requirements: 'Requirements',
  design: 'Design',
  tasks: 'Tasks'
};
function SpecsScreen({
  onOpen
}) {
  const specs = window.RL_DATA.specs;
  const stats = {
    review: specs.filter(s => s.status === 'in_review').length,
    approved: specs.filter(s => s.status === 'approved').length,
    denied: specs.filter(s => s.status === 'denied').length
  };
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "dk-page-h"
  }, /*#__PURE__*/React.createElement("h1", null, "Specs"), /*#__PURE__*/React.createElement("span", {
    className: "dk-page-sub"
  }, specs.length, " in pipeline \xB7 ", stats.review, " awaiting review")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement(StatChip, {
    icon: "clock",
    label: "In review",
    value: stats.review,
    tone: "in_review"
  }), /*#__PURE__*/React.createElement(StatChip, {
    icon: "circle-check",
    label: "Approved",
    value: stats.approved,
    tone: "approved"
  }), /*#__PURE__*/React.createElement(StatChip, {
    icon: "circle-x",
    label: "Denied",
    value: stats.denied,
    tone: "denied"
  })), /*#__PURE__*/React.createElement("table", {
    className: "dk-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      width: 60
    }
  }, "ID"), /*#__PURE__*/React.createElement("th", null, "Spec"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 130
    }
  }, "Stage"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 120
    }
  }, "Status"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 170
    }
  }, "Actor"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 80
    }
  }, "Model"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 90
    }
  }, "Updated"))), /*#__PURE__*/React.createElement("tbody", null, specs.map(s => /*#__PURE__*/React.createElement("tr", {
    key: s.id,
    onClick: () => onOpen(s.id)
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    className: "dk-id"
  }, "#", s.id)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    className: "dk-strong"
  }, s.title)), /*#__PURE__*/React.createElement("td", {
    className: "dk-mono"
  }, STAGE_NAMES[s.stage] || s.stage), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(StatusBadge, {
    status: s.status === 'not_started' ? 'draft' : s.status,
    label: s.status
  })), /*#__PURE__*/React.createElement("td", {
    className: "dk-mono"
  }, s.actor), /*#__PURE__*/React.createElement("td", null, s.model === '—' ? /*#__PURE__*/React.createElement("span", {
    className: "dk-mono"
  }, "\u2014") : /*#__PURE__*/React.createElement(Badge, {
    tone: "accent"
  }, s.model)), /*#__PURE__*/React.createElement("td", {
    className: "dk-mono"
  }, s.updated))))));
}
function StatChip({
  icon,
  label,
  value,
  tone
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '12px 16px',
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-md)',
      minWidth: 150
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: `rl-status rl-status--${tone}`,
    style: {
      padding: 6,
      borderRadius: '50%'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 16
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 22,
      fontWeight: 600,
      color: 'var(--text-strong)',
      lineHeight: 1
    }
  }, value), /*#__PURE__*/React.createElement("div", {
    className: "dk-mono",
    style: {
      fontSize: 11
    }
  }, label)));
}
Object.assign(window, {
  SpecsScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/SpecsScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/Topbar.jsx
try { (() => {
const {
  Icon,
  Button
} = window.RelentlessDesignSystem_81cf11;
function Topbar({
  crumbs,
  onNewSpec
}) {
  return /*#__PURE__*/React.createElement("header", {
    className: "dk-top"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dk-top__crumb"
  }, crumbs.map((c, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, i > 0 && /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 13
  }), i === crumbs.length - 1 ? /*#__PURE__*/React.createElement("span", {
    className: "dk-top__title"
  }, c) : /*#__PURE__*/React.createElement("span", null, c)))), /*#__PURE__*/React.createElement("div", {
    className: "dk-top__spacer"
  }), /*#__PURE__*/React.createElement("div", {
    className: "dk-search"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: 15
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: "Search specs, runs, actors\u2026"
  })), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm",
    icon: "plus",
    onClick: onNewSpec
  }, "New spec"));
}
Object.assign(window, {
  Topbar
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/Topbar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/TrailDetailScreen.jsx
try { (() => {
const {
  Tabs,
  Badge,
  Button,
  Icon
} = window.RelentlessDesignSystem_81cf11;
const WP_STATE = {
  sighted: {
    color: 'var(--slate-400)',
    icon: 'circle-dashed',
    dash: true
  },
  marked: {
    color: 'var(--sky-500)',
    icon: 'map-pin'
  },
  claimed: {
    color: 'var(--amber-400)',
    icon: 'lock'
  },
  reached: {
    color: 'var(--green-400)',
    icon: 'circle-check'
  },
  bypassed: {
    color: 'var(--text-faint)',
    icon: 'circle-slash',
    dash: true
  }
};
const APPROACH_ICON = {
  grilling: 'messages-square',
  research: 'book-open',
  prototype: 'flask-conical',
  task: 'wrench'
};
function wpDepth(wp, byN, memo = {}) {
  if (memo[wp.n] != null) return memo[wp.n];
  memo[wp.n] = 0; // guard cycles
  const d = wp.deps.length ? Math.max(...wp.deps.map(n => wpDepth(byN[n], byN, memo))) + 1 : 0;
  memo[wp.n] = d;
  return d;
}
function TrailGraph({
  waypoints,
  frontier
}) {
  const byN = Object.fromEntries(waypoints.map(w => [w.n, w]));
  const memo = {};
  waypoints.forEach(w => wpDepth(w, byN, memo));
  const cols = [];
  waypoints.forEach(w => {
    (cols[memo[w.n]] = cols[memo[w.n]] || []).push(w);
  });
  const NW = 158,
    NH = 46,
    CG = 208,
    RG = 64,
    PAD = 16;
  const pos = {};
  cols.forEach((col, ci) => col.forEach((w, ri) => {
    pos[w.n] = {
      x: PAD + ci * CG,
      y: PAD + ri * RG
    };
  }));
  const H = PAD * 2 + Math.max(...cols.map(c => c.length)) * RG - (RG - NH);
  const W = PAD * 2 + cols.length * CG - (CG - NW);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-md)',
      padding: 8,
      overflowX: 'auto'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: W,
    height: H,
    style: {
      display: 'block',
      fontFamily: 'var(--font-mono)'
    }
  }, waypoints.flatMap(w => w.deps.map(d => {
    const a = pos[d],
      b = pos[w.n];
    const x1 = a.x + NW,
      y1 = a.y + NH / 2,
      x2 = b.x,
      y2 = b.y + NH / 2;
    return /*#__PURE__*/React.createElement("path", {
      key: `${d}-${w.n}`,
      d: `M ${x1} ${y1} C ${x1 + 34} ${y1}, ${x2 - 34} ${y2}, ${x2} ${y2}`,
      fill: "none",
      stroke: "var(--border-strong)",
      strokeWidth: "1"
    });
  })), waypoints.map(w => {
    const p = pos[w.n],
      s = WP_STATE[w.status];
    const isFrontier = frontier.has(w.n);
    return /*#__PURE__*/React.createElement("g", {
      key: w.n,
      transform: `translate(${p.x},${p.y})`
    }, /*#__PURE__*/React.createElement("rect", {
      width: NW,
      height: NH,
      rx: "6",
      fill: "var(--bg-surface-2)",
      stroke: isFrontier ? 'var(--green-400)' : s.color,
      strokeWidth: isFrontier ? 1.5 : 1,
      strokeDasharray: s.dash ? '4 3' : 'none'
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "14",
      cy: NH / 2,
      r: "3.5",
      fill: s.color
    }), /*#__PURE__*/React.createElement("text", {
      x: "26",
      y: "19",
      fontSize: "10",
      fill: s.color
    }, "W", w.n, " \xB7 ", w.status, w.stuck ? ' · stuck' : '', isFrontier ? ' · frontier' : ''), /*#__PURE__*/React.createElement("text", {
      x: "26",
      y: "34",
      fontSize: "11",
      fill: "var(--text-strong)"
    }, w.title.length > 21 ? w.title.slice(0, 20) + '…' : w.title));
  })));
}
function TrailDetailScreen({
  trailId,
  onToast,
  onOpenSpec
}) {
  const trail = window.RL_DATA.trailDetails[trailId] || window.RL_DATA.trailDetails['auth-hardening'];
  const TONE = {
    active: 'accent',
    complete: 'success',
    abandoned: 'neutral'
  };
  const isActive = trail.status === 'active';
  const [tab, setTab] = React.useState('graph');
  const [released, setReleased] = React.useState({});
  const waypoints = trail.waypoints.map(w => released[w.n] ? {
    ...w,
    status: 'marked',
    claimedBy: undefined,
    claimedFor: undefined,
    stuck: false
  } : w);
  const byN = Object.fromEntries(waypoints.map(w => [w.n, w]));
  const terminal = n => byN[n].status === 'reached' || byN[n].status === 'bypassed';
  // frontier: marked (or stale-claimed) waypoints whose blockers have all terminated
  const frontier = new Set(waypoints.filter(w => (w.status === 'marked' || w.status === 'claimed' && w.stuck) && w.deps.every(terminal)).map(w => w.n));
  const release = w => {
    setReleased(r => ({
      ...r,
      [w.n]: true
    }));
    onToast({
      tone: 'success',
      title: 'Claim released',
      message: `release_waypoint · W${w.n} back to marked, frontier-eligible.`
    });
  };
  const reached = waypoints.filter(w => w.status === 'reached').length;
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "dk-page-h",
    style: {
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, trail.title, " ", /*#__PURE__*/React.createElement(Badge, {
    tone: TONE[trail.status]
  }, trail.status)), /*#__PURE__*/React.createElement("span", {
    className: "dk-page-sub",
    style: {
      fontFamily: 'var(--font-mono)'
    }
  }, trail.id, " \xB7 ", reached, "/", waypoints.length, " reached \xB7 frontier ", frontier.size), isActive && /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    icon: "flag-triangle-right",
    onClick: () => onToast({
      tone: 'info',
      title: 'complete_trail',
      message: 'Outcome spec creates + links the spec in one transaction.'
    })
  }, "Complete \u2192 spec"))), /*#__PURE__*/React.createElement("div", {
    className: "dk-detail"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement(Tabs, {
    value: tab,
    onChange: setTab,
    items: [{
      value: 'graph',
      label: 'Frontier graph',
      icon: 'waypoints'
    }, {
      value: 'list',
      label: 'Waypoints',
      icon: 'list'
    }]
  }), tab === 'graph' && /*#__PURE__*/React.createElement(TrailGraph, {
    waypoints: waypoints,
    frontier: frontier
  }), tab === 'list' && /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: 'auto',
      borderRadius: 'var(--radius-md)'
    }
  }, /*#__PURE__*/React.createElement("table", {
    className: "dk-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      width: 56
    }
  }, "WP"), /*#__PURE__*/React.createElement("th", null, "Waypoint"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 110
    }
  }, "Status"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 110
    }
  }, "Approach"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 110
    }
  }, "Blockers"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 190
    }
  }, "Claim / resolution"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 130
    }
  }))), /*#__PURE__*/React.createElement("tbody", null, waypoints.map(w => {
    const s = WP_STATE[w.status];
    return /*#__PURE__*/React.createElement("tr", {
      key: w.n,
      style: {
        cursor: 'default'
      }
    }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
      className: "dk-mono",
      style: {
        color: s.color
      }
    }, "W", w.n)), /*#__PURE__*/React.createElement("td", {
      className: "dk-strong",
      style: w.status === 'bypassed' ? {
        textDecoration: 'line-through',
        color: 'var(--text-faint)',
        fontWeight: 400
      } : {}
    }, w.title, w.bypassReason && /*#__PURE__*/React.createElement("span", {
      className: "dk-mono",
      style: {
        marginLeft: 8
      }
    }, "\xB7 ", w.bypassReason), frontier.has(w.n) && /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: 8,
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        color: 'var(--green-400)',
        border: '1px solid var(--green-400)',
        borderRadius: 3,
        padding: '1px 5px'
      }
    }, "frontier")), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        color: s.color
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: s.icon,
      size: 13
    }), " ", w.status)), /*#__PURE__*/React.createElement("td", null, w.approach ? /*#__PURE__*/React.createElement("span", {
      className: "dk-mono",
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: APPROACH_ICON[w.approach],
      size: 13
    }), " ", w.approach) : /*#__PURE__*/React.createElement("span", {
      className: "dk-mono"
    }, "\u2014")), /*#__PURE__*/React.createElement("td", {
      className: "dk-mono"
    }, w.deps.length ? w.deps.map(n => 'W' + n).join(' ') : '—'), /*#__PURE__*/React.createElement("td", null, w.status === 'claimed' ? /*#__PURE__*/React.createElement("span", {
      className: "dk-mono",
      style: {
        color: w.stuck ? 'var(--amber-400)' : 'var(--text-muted)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6
      }
    }, w.stuck && /*#__PURE__*/React.createElement(Icon, {
      name: "triangle-alert",
      size: 13
    }), w.claimedBy, " \xB7 ", w.claimedFor, w.stuck ? ` · > ttl ${trail.claimTtl}` : '') : w.gist ? /*#__PURE__*/React.createElement("span", {
      className: "dk-mono",
      style: {
        fontSize: 11.5
      },
      title: w.gist
    }, w.gist.length > 34 ? w.gist.slice(0, 33) + '…' : w.gist) : /*#__PURE__*/React.createElement("span", {
      className: "dk-mono"
    }, "\u2014")), /*#__PURE__*/React.createElement("td", {
      style: {
        textAlign: 'right'
      }
    }, w.status === 'claimed' && /*#__PURE__*/React.createElement(Button, {
      variant: w.stuck ? 'danger' : 'secondary',
      size: "sm",
      icon: "lock-open",
      onClick: () => release(w)
    }, "Release claim")));
  }))))), /*#__PURE__*/React.createElement("div", {
    className: "dk-aside"
  }, trail.outcome && /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-md)',
      padding: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "dk-meta__k",
    style: {
      marginBottom: 8,
      display: 'flex',
      alignItems: 'center',
      gap: 7
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: trail.status === 'abandoned' ? 'circle-slash' : 'flag-triangle-right',
    size: 14
  }), " Outcome", trail.outcome.kind ? ` · ${trail.outcome.kind}` : ''), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-muted)',
      margin: 0,
      lineHeight: 1.5
    }
  }, trail.outcome.summary), trail.outcome.spec && /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    icon: "arrow-right",
    style: {
      marginTop: 10
    },
    onClick: () => onOpenSpec(trail.outcome.spec)
  }, "spec #", trail.outcome.spec)), /*#__PURE__*/React.createElement("div", {
    className: "dk-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dk-meta__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dk-meta__k"
  }, "Trail"), /*#__PURE__*/React.createElement("span", {
    className: "dk-mono"
  }, trail.id)), /*#__PURE__*/React.createElement("div", {
    className: "dk-meta__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dk-meta__k"
  }, "Claim TTL"), /*#__PURE__*/React.createElement("span", {
    className: "dk-mono"
  }, trail.claimTtl)), /*#__PURE__*/React.createElement("div", {
    className: "dk-meta__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dk-meta__k"
  }, "Created"), /*#__PURE__*/React.createElement("span", {
    className: "dk-mono"
  }, trail.created)), /*#__PURE__*/React.createElement("div", {
    className: "dk-meta__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dk-meta__k"
  }, "Updated"), /*#__PURE__*/React.createElement("span", {
    className: "dk-mono"
  }, trail.updated)), /*#__PURE__*/React.createElement("div", {
    className: "dk-meta__row",
    style: {
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: 3
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "dk-meta__k"
  }, "Destination"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5,
      lineHeight: 1.5,
      color: 'var(--text-muted)'
    }
  }, trail.destination))), /*#__PURE__*/React.createElement("div", {
    className: "dk-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dk-meta__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dk-meta__k"
  }, "Assets"), /*#__PURE__*/React.createElement("span", {
    className: "dk-mono"
  }, trail.assets.length)), trail.assets.map(a => /*#__PURE__*/React.createElement("div", {
    key: a.title,
    className: "dk-meta__row",
    style: {
      justifyContent: 'flex-start',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: a.repoPath ? 'git-commit-horizontal' : 'file-text',
    size: 14,
    style: {
      color: 'var(--text-muted)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "dk-mono",
    style: {
      display: 'block',
      color: 'var(--text-body)'
    }
  }, a.title), /*#__PURE__*/React.createElement("span", {
    className: "dk-mono",
    style: {
      fontSize: 10.5
    }
  }, a.kind, a.repoPath ? ` · ${a.repoPath} @ ${a.sha}` : '')), /*#__PURE__*/React.createElement("span", {
    className: "dk-mono",
    style: {
      marginLeft: 'auto',
      fontSize: 11
    }
  }, "W", a.wp)))), /*#__PURE__*/React.createElement("div", {
    className: "dk-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dk-meta__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dk-meta__k"
  }, "Trail terms"), /*#__PURE__*/React.createElement("span", {
    className: "dk-mono"
  }, trail.terms.length)), trail.terms.map(g => /*#__PURE__*/React.createElement("div", {
    key: g.term,
    className: "dk-meta__row",
    style: {
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: 3
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "dk-mono",
    style: {
      color: 'var(--text-brand)',
      fontSize: 12
    }
  }, g.term), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5,
      lineHeight: 1.5,
      color: 'var(--text-muted)'
    }
  }, g.definition)))))));
}
Object.assign(window, {
  TrailDetailScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/TrailDetailScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/TrailsScreen.jsx
try { (() => {
const {
  Badge,
  Icon
} = window.RelentlessDesignSystem_81cf11;
const TRAIL_TONE = {
  active: 'accent',
  complete: 'success',
  abandoned: 'neutral'
};
function TrailsScreen({
  onOpen,
  onOpenSpec
}) {
  const [filter, setFilter] = React.useState('all');
  const trails = window.RL_DATA.trails.filter(t => filter === 'all' || t.status === filter);
  const counts = window.RL_DATA.trails.reduce((a, t) => (a[t.status] = (a[t.status] || 0) + 1, a), {});
  const chip = (key, label) => /*#__PURE__*/React.createElement("button", {
    key: key,
    onClick: () => setFilter(key),
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      padding: '3px 10px',
      borderRadius: 'var(--radius-xs)',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      border: `1px solid ${filter === key ? 'var(--accent)' : 'var(--border-default)'}`,
      background: filter === key ? 'var(--accent-soft)' : 'none',
      color: filter === key ? 'var(--text-brand)' : 'var(--text-muted)'
    }
  }, label, key !== 'all' && counts[key] ? ` · ${counts[key]}` : '');
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "dk-page-h"
  }, /*#__PURE__*/React.createElement("h1", null, "Trails"), /*#__PURE__*/React.createElement("span", {
    className: "dk-page-sub"
  }, "Discovery arenas \u2014 loose ideas driven to decisions before they become specs"), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7,
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      color: 'var(--text-muted)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 7,
      height: 7,
      borderRadius: 99,
      background: 'var(--green-400)'
    }
  }), "sse \xB7 trail_changed \xB7 12s ago")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginBottom: 18
    }
  }, chip('all', 'all'), chip('active', 'active'), chip('complete', 'complete'), chip('abandoned', 'abandoned')), /*#__PURE__*/React.createElement("table", {
    className: "dk-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      width: 180
    }
  }, "Trail"), /*#__PURE__*/React.createElement("th", null, "Title"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 110
    }
  }, "Status"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 230
    }
  }, "Waypoints"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 160
    }
  }, "Outcome"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 90
    }
  }, "Updated"))), /*#__PURE__*/React.createElement("tbody", null, trails.map(t => /*#__PURE__*/React.createElement("tr", {
    key: t.id,
    onClick: () => onOpen(t.id)
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    className: "dk-id"
  }, t.id)), /*#__PURE__*/React.createElement("td", {
    className: "dk-strong"
  }, t.title), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(Badge, {
    tone: TRAIL_TONE[t.status]
  }, t.status)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 72,
      height: 4,
      borderRadius: 2,
      background: 'var(--bg-inset)',
      overflow: 'hidden',
      flex: 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${Math.round(t.reached / t.total * 100)}%`,
      height: '100%',
      background: 'var(--green-400)'
    }
  })), /*#__PURE__*/React.createElement("span", {
    className: "dk-mono"
  }, t.reached, "/", t.total, " reached", t.claimed ? ` · ${t.claimed} claimed` : ''), t.stuck > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      color: 'var(--amber-400)',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "triangle-alert",
    size: 12
  }), " ", t.stuck, " stuck"))), /*#__PURE__*/React.createElement("td", null, t.outcome === 'spec' ? /*#__PURE__*/React.createElement("button", {
    onClick: e => {
      e.stopPropagation();
      onOpenSpec(t.spec);
    },
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      border: 'none',
      background: 'none',
      cursor: 'pointer',
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      color: 'var(--text-link)',
      padding: 0
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-right",
    size: 13
  }), " spec #", t.spec) : t.outcome ? /*#__PURE__*/React.createElement("span", {
    className: "dk-mono"
  }, t.outcome) : /*#__PURE__*/React.createElement("span", {
    className: "dk-mono"
  }, "\u2014")), /*#__PURE__*/React.createElement("td", {
    className: "dk-mono"
  }, t.updated))))));
}
Object.assign(window, {
  TrailsScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/TrailsScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/data.js
try { (() => {
// Fake data for the Rig dashboard UI kit — field names & enums aligned to the relentless schema
// (spec_pipeline / discovery / public schemas in spec-templates/spec/db/schema.sql).
window.RL_DATA = {
  // spec_pipeline.projects — tenant/workspace scope for specs, trails, prompts, workflows
  projects: [{
    slug: 'relentless',
    name: 'Relentless',
    specs: 6,
    trails: 3,
    current: true
  }, {
    slug: 'pi-coding-agent',
    name: 'Pi Coding Agent',
    specs: 4,
    trails: 1
  }, {
    slug: 'earendil-site',
    name: 'Earendil Site',
    specs: 2,
    trails: 0
  }],
  // spec_pipeline.specs — stage: spec_stage_name enum; status: stage_status enum (+ 'denied' as the UI event; deny stores a freeform reason and sends the stage back for redraft)
  specs: [{
    id: 'a1f3',
    slug: 'structured-logging-pipeline',
    title: 'Structured logging pipeline',
    stage: 'design',
    status: 'in_review',
    actor: 'design-drafter',
    model: 'opus',
    updated: '4m ago',
    reqs: 14,
    tasks: 0
  }, {
    id: '7b02',
    slug: 'postgres-connection-pooling',
    title: 'Postgres connection pooling',
    stage: 'tasks',
    status: 'approved',
    actor: 'spec-implementation-orchestrator',
    model: 'haiku',
    updated: '1m ago',
    reqs: 9,
    tasks: 22
  }, {
    id: 'c4d9',
    slug: 'mcp-tool-auth',
    title: 'MCP tool auth + actor validation',
    stage: 'requirements',
    status: 'approved',
    actor: 'requirements-compiler',
    model: 'sonnet',
    updated: '32m ago',
    reqs: 11,
    tasks: 0
  }, {
    id: 'e8a1',
    slug: 'trail-persistence',
    title: 'Trail persistence (discovery schema)',
    stage: 'tasks',
    status: 'in_review',
    actor: 'tasks-drafter',
    model: 'sonnet',
    updated: '1h ago',
    reqs: 7,
    tasks: 18
  }, {
    id: 'f230',
    slug: 'scheduler-back-pressure',
    title: 'Scheduler back-pressure & claim locks',
    stage: 'design',
    status: 'denied',
    denialReason: 'Data model missing traceability to REQ-014.',
    actor: 'design-drafter',
    model: 'opus',
    updated: '2h ago',
    reqs: 12,
    tasks: 0
  }, {
    id: '9c77',
    slug: 'pi-executor-parity',
    title: 'Pi executor parity harness',
    stage: 'requirements',
    status: 'not_started',
    actor: 'requirements-compiler',
    model: 'sonnet',
    updated: '3h ago',
    reqs: 0,
    tasks: 0
  }],
  // spec_pipeline.spec_stages — exactly three stages per spec
  stages: [{
    key: 'requirements',
    label: 'Requirements',
    agent: 'requirements-compiler',
    model: 'sonnet',
    status: 'approved'
  }, {
    key: 'design',
    label: 'Design',
    agent: 'design-drafter',
    model: 'opus',
    status: 'in_review'
  }, {
    key: 'tasks',
    label: 'Tasks',
    agent: 'tasks-drafter',
    model: 'sonnet',
    status: 'not_started'
  }],
  // public.runs — workflow_id / current_node_id; executor: RELENTLESS_DEFAULT_EXECUTOR ('claude' | 'pi')
  runs: [{
    id: 'run_7f3a',
    workflow: 'relentless-default',
    node: 'design.compile',
    kind: 'agent',
    status: 'running',
    executor: 'claude',
    started: '1m ago'
  }, {
    id: 'run_5c18',
    workflow: 'relentless-default',
    node: 'requirements.gate',
    kind: 'human',
    status: 'in_review',
    executor: '—',
    started: '18m ago'
  }, {
    id: 'run_2b90',
    workflow: 'relentless-default',
    node: 'tasks.compile',
    kind: 'agent',
    status: 'approved',
    executor: 'pi',
    started: '44m ago'
  }, {
    id: 'run_0d41',
    workflow: 'nightly-audit',
    node: 'scan.guard',
    kind: 'guard',
    status: 'approved',
    executor: '—',
    started: '2h ago'
  }, {
    id: 'run_9a2e',
    workflow: 'relentless-default',
    node: 'design.gate',
    kind: 'human',
    status: 'denied',
    executor: '—',
    started: '2h ago'
  }],
  // spec_pipeline.audit_log — append-only; actor · action (insert|update|delete|finalize) · table_name · row_id. Rejected writes never reach the log (the known_actors guard fires first).
  audit: [{
    ts: '14:02:11',
    actor: 'design-drafter',
    action: 'finalize',
    table: 'spec_pipeline.designs',
    row: 'a1f3'
  }, {
    ts: '14:01:56',
    actor: 'design-drafter',
    action: 'update',
    table: 'spec_pipeline.design_components',
    row: 'd_02'
  }, {
    ts: '13:58:02',
    actor: 'scheduler',
    action: 'update',
    table: 'public.runs',
    row: 'run_7f3a'
  }, {
    ts: '13:44:30',
    actor: 'grilling',
    action: 'insert',
    table: 'discovery.trail_terms',
    row: 'grip token'
  }, {
    ts: '13:40:12',
    actor: 'requirements-compiler',
    action: 'finalize',
    table: 'spec_pipeline.requirements',
    row: 'c4d9'
  }, {
    ts: '13:12:47',
    actor: 'code-implementer',
    action: 'update',
    table: 'spec_pipeline.task_items',
    row: '7b02 · 14/22'
  }, {
    ts: '12:59:03',
    actor: 'wayfinder',
    action: 'insert',
    table: 'discovery.waypoints',
    row: 'auth-hardening · W8'
  }],
  // spec_pipeline.known_actors — actor + source (synced at boot from <agentsDir>/<name>/SKILL.md)
  actors: [{
    actor: 'grilling',
    source: '/skills/grilling/SKILL.md',
    synced: 'boot · 2h ago'
  }, {
    actor: 'wayfinder',
    source: '/skills/wayfinder/SKILL.md',
    synced: 'boot · 2h ago'
  }, {
    actor: 'requirements-compiler',
    source: '/skills/requirements-compiler/SKILL.md',
    synced: 'boot · 2h ago'
  }, {
    actor: 'design-drafter',
    source: '/skills/design-drafter/SKILL.md',
    synced: 'boot · 2h ago'
  }, {
    actor: 'tasks-drafter',
    source: '/skills/tasks-drafter/SKILL.md',
    synced: 'boot · 2h ago'
  }, {
    actor: 'spec-implementation-orchestrator',
    source: '/skills/spec-implementation-orchestrator/SKILL.md',
    synced: 'boot · 2h ago'
  }, {
    actor: 'code-implementer',
    source: '/skills/code-implementer/SKILL.md',
    synced: 'boot · 2h ago'
  }, {
    actor: 'test-writer',
    source: '/skills/test-writer/SKILL.md',
    synced: 'boot · 2h ago'
  }, {
    actor: 'code-reviewer',
    source: '/skills/code-reviewer/SKILL.md',
    synced: 'boot · 2h ago'
  }],
  // discovery.trails — status: active | complete | abandoned; outcome_kind: spec | decision | change
  trails: [{
    id: 'auth-hardening',
    title: 'Auth hardening discovery',
    status: 'active',
    reached: 4,
    total: 9,
    claimed: 2,
    stuck: 1,
    outcome: null,
    spec: null,
    updated: '2m ago'
  }, {
    id: 'structured-logging',
    title: 'Structured logging',
    status: 'complete',
    reached: 7,
    total: 7,
    claimed: 0,
    stuck: 0,
    outcome: 'spec',
    spec: 'a1f3',
    updated: '1h ago'
  }, {
    id: 'multi-tenant-billing',
    title: 'Multi-tenant billing model',
    status: 'active',
    reached: 2,
    total: 11,
    claimed: 1,
    stuck: 1,
    outcome: null,
    spec: null,
    updated: '3h ago'
  }, {
    id: 'rate-limit-strategy',
    title: 'Rate-limit strategy',
    status: 'active',
    reached: 5,
    total: 8,
    claimed: 0,
    stuck: 0,
    outcome: null,
    spec: null,
    updated: '5h ago'
  }, {
    id: 'search-index-rebuild',
    title: 'Search index rebuild',
    status: 'abandoned',
    reached: 1,
    total: 6,
    claimed: 0,
    stuck: 0,
    outcome: null,
    spec: null,
    updated: '2d ago'
  }, {
    id: 'webhook-retry-semantics',
    title: 'Webhook retry semantics',
    status: 'complete',
    reached: 5,
    total: 5,
    claimed: 0,
    stuck: 0,
    outcome: 'decision',
    spec: null,
    updated: '3d ago'
  }],
  // discovery.waypoints — sighted → marked → claimed → reached | bypassed; approach: grilling | research | prototype | task; claimed_by is a session identifier
  trailDetails: {
    'auth-hardening': {
      id: 'auth-hardening',
      title: 'Auth hardening discovery',
      status: 'active',
      trailhead: 'Sessions feel fragile — figure out what auth hardening actually means for v2.',
      destination: 'A hardened auth design ready to hand to the spec pipeline.',
      claimTtl: '24h',
      created: '2d ago',
      updated: '2m ago',
      waypoints: [{
        n: 1,
        title: 'Threat model & attack surface',
        status: 'reached',
        deps: [],
        approach: 'research',
        gist: 'STRIDE pass done; token theft + replay top the list.',
        reachedIn: 'cc-0711-b',
        age: '2d ago'
      }, {
        n: 2,
        title: 'Session storage: cookie vs token',
        status: 'reached',
        deps: [1],
        approach: 'grilling',
        gist: 'Cookie sessions + short-lived grip tokens.',
        reachedIn: 'cc-0712-a',
        age: '1d ago'
      }, {
        n: 3,
        title: 'Token rotation policy',
        status: 'reached',
        deps: [2],
        approach: 'prototype',
        gist: 'Rotate on privilege change; bench holds at p99 4ms.',
        reachedIn: 'cc-0712-c',
        age: '1d ago'
      }, {
        n: 4,
        title: 'Rate-limit tiers for auth endpoints',
        status: 'reached',
        deps: [1],
        approach: 'research',
        gist: 'Three tiers keyed on endpoint sensitivity.',
        reachedIn: 'cc-0713-a',
        age: '20h ago'
      }, {
        n: 5,
        title: 'MFA scope & enrollment flow',
        status: 'claimed',
        deps: [1, 2],
        approach: 'grilling',
        claimedBy: 'cc-0713-d',
        claimedFor: '12m'
      }, {
        n: 6,
        title: 'Password reset & recovery',
        status: 'claimed',
        deps: [2, 3],
        approach: 'grilling',
        claimedBy: 'cc-0710-f',
        claimedFor: '26h',
        stuck: true
      }, {
        n: 7,
        title: 'Audit hooks for auth events',
        status: 'marked',
        deps: [3],
        approach: 'task'
      }, {
        n: 8,
        title: 'Legacy session migration',
        status: 'sighted',
        deps: [2]
      }, {
        n: 9,
        title: 'RBAC model',
        status: 'bypassed',
        deps: [1],
        bypassReason: 'folded into MFA scope'
      }],
      // discovery.waypoint_assets — kind is an open set; document (content) XOR reference (repo_path @ commit_sha)
      assets: [{
        kind: 'research_summary',
        title: 'Threat model',
        wp: 1
      }, {
        kind: 'analysis',
        title: 'Session storage matrix',
        wp: 2
      }, {
        kind: 'prototype_ref',
        title: 'Token rotation bench',
        wp: 3,
        repoPath: 'proto/rotation-bench',
        sha: 'e4f19c2'
      }],
      // discovery.trail_terms
      terms: [{
        term: 'grip token',
        definition: 'Short-lived credential minted on session upgrade.'
      }, {
        term: 'frontier',
        definition: 'Marked waypoints whose blockers have all terminated — eligible to claim.'
      }, {
        term: 'bypass',
        definition: 'Waypoint routed around without a decision; reason recorded.'
      }]
    },
    'structured-logging': {
      id: 'structured-logging',
      title: 'Structured logging',
      status: 'complete',
      trailhead: 'Logs are unstructured strings — decide what structured logging should look like.',
      destination: 'A logging pipeline spec ready for requirements.',
      claimTtl: '24h',
      created: '5d ago',
      updated: '1h ago',
      outcome: {
        kind: 'spec',
        spec: 'a1f3',
        summary: 'Seven decisions locked; handed off as structured-logging-pipeline in one complete_trail transaction.'
      },
      waypoints: [{
        n: 1,
        title: 'Event envelope shape',
        status: 'reached',
        deps: [],
        approach: 'grilling',
        gist: 'JSON envelope: ts, level, actor, table, payload.',
        reachedIn: 'cc-0708-a',
        age: '5d ago'
      }, {
        n: 2,
        title: 'Where logs live',
        status: 'reached',
        deps: [1],
        approach: 'research',
        gist: 'Postgres audit_log, not a separate store.',
        reachedIn: 'cc-0708-b',
        age: '4d ago'
      }, {
        n: 3,
        title: 'Collector batching',
        status: 'reached',
        deps: [2],
        approach: 'prototype',
        gist: 'Batch flush at 200ms/500 rows holds p99.',
        reachedIn: 'cc-0709-a',
        age: '4d ago'
      }, {
        n: 4,
        title: 'Render pipeline',
        status: 'reached',
        deps: [1],
        approach: 'grilling',
        gist: 'Markdown materialized on demand, never stored.',
        reachedIn: 'cc-0709-a',
        age: '3d ago'
      }, {
        n: 5,
        title: 'Retention policy',
        status: 'reached',
        deps: [2],
        approach: 'grilling',
        gist: 'Append-only, no TTL — revisit at 10M rows.',
        reachedIn: 'cc-0710-c',
        age: '3d ago'
      }, {
        n: 6,
        title: 'Back-pressure strategy',
        status: 'reached',
        deps: [3],
        approach: 'research',
        gist: 'Scheduler concurrency cap is the only valve needed.',
        reachedIn: 'cc-0710-c',
        age: '2d ago'
      }, {
        n: 7,
        title: 'PII in payloads',
        status: 'reached',
        deps: [1],
        approach: 'grilling',
        gist: 'Payloads carry row ids only, never row content.',
        reachedIn: 'cc-0711-a',
        age: '2d ago'
      }],
      assets: [{
        kind: 'research_summary',
        title: 'Log store survey',
        wp: 2
      }, {
        kind: 'prototype_ref',
        title: 'Collector batch bench',
        wp: 3,
        repoPath: 'proto/collector-bench',
        sha: 'a91c04d'
      }],
      terms: [{
        term: 'event envelope',
        definition: 'The fixed JSON wrapper every structured log event ships in.'
      }]
    },
    'webhook-retry-semantics': {
      id: 'webhook-retry-semantics',
      title: 'Webhook retry semantics',
      status: 'complete',
      trailhead: 'Webhooks fail silently — pin down retry semantics.',
      destination: 'A locked retry policy; no build expected.',
      claimTtl: '24h',
      created: '1w ago',
      updated: '3d ago',
      outcome: {
        kind: 'decision',
        spec: null,
        summary: 'Exponential backoff with jitter, 5 attempts, then DLQ. Decision locked — nothing to build from it.'
      },
      waypoints: [{
        n: 1,
        title: 'Failure taxonomy',
        status: 'reached',
        deps: [],
        approach: 'research',
        gist: 'Timeouts dominate; 4xx are config errors.',
        reachedIn: 'cc-0705-a',
        age: '1w ago'
      }, {
        n: 2,
        title: 'Backoff curve',
        status: 'reached',
        deps: [1],
        approach: 'grilling',
        gist: 'Exponential + full jitter, base 30s.',
        reachedIn: 'cc-0705-a',
        age: '6d ago'
      }, {
        n: 3,
        title: 'Attempt ceiling',
        status: 'reached',
        deps: [2],
        approach: 'grilling',
        gist: 'Five attempts, then dead-letter.',
        reachedIn: 'cc-0706-b',
        age: '5d ago'
      }, {
        n: 4,
        title: 'DLQ surfacing',
        status: 'reached',
        deps: [3],
        approach: 'grilling',
        gist: 'DLQ rows surface in the audit log view.',
        reachedIn: 'cc-0706-b',
        age: '4d ago'
      }, {
        n: 5,
        title: 'Consumer idempotency',
        status: 'reached',
        deps: [1],
        approach: 'research',
        gist: 'Delivery id header; consumers dedupe.',
        reachedIn: 'cc-0707-a',
        age: '3d ago'
      }],
      assets: [{
        kind: 'analysis',
        title: 'Failure-mode breakdown',
        wp: 1
      }],
      terms: [{
        term: 'DLQ',
        definition: 'Dead-letter queue — deliveries parked after the attempt ceiling.'
      }]
    },
    'search-index-rebuild': {
      id: 'search-index-rebuild',
      title: 'Search index rebuild',
      status: 'abandoned',
      trailhead: 'Full-text search feels slow — is an index rebuild worth it?',
      destination: 'Go/no-go on a rebuilt search index.',
      claimTtl: '24h',
      created: '2w ago',
      updated: '2d ago',
      outcome: {
        kind: null,
        spec: null,
        summary: 'Abandoned — rebuild cost dwarfs the win until the corpus passes ~10M docs. Revisit then.'
      },
      waypoints: [{
        n: 1,
        title: 'Current query latency profile',
        status: 'reached',
        deps: [],
        approach: 'research',
        gist: 'p95 is 240ms; pain is real but tolerable.',
        reachedIn: 'cc-0701-a',
        age: '2w ago'
      }, {
        n: 2,
        title: 'Candidate index engines',
        status: 'marked',
        deps: [1],
        approach: 'research'
      }, {
        n: 3,
        title: 'Reindex migration cost',
        status: 'marked',
        deps: [1],
        approach: 'task'
      }, {
        n: 4,
        title: 'Query API compatibility',
        status: 'sighted',
        deps: [2]
      }, {
        n: 5,
        title: 'Relevance tuning owner',
        status: 'sighted',
        deps: [2]
      }, {
        n: 6,
        title: 'Cutover strategy',
        status: 'sighted',
        deps: [3]
      }],
      assets: [{
        kind: 'research_summary',
        title: 'Latency profile',
        wp: 1
      }],
      terms: []
    },
    'multi-tenant-billing': {
      id: 'multi-tenant-billing',
      title: 'Multi-tenant billing model',
      status: 'active',
      trailhead: 'Billing assumes one tenant — figure out the multi-tenant model.',
      destination: 'A billing model spec ready for requirements.',
      claimTtl: '24h',
      created: '1w ago',
      updated: '3h ago',
      waypoints: [{
        n: 1,
        title: 'Tenant boundary definition',
        status: 'reached',
        deps: [],
        approach: 'grilling',
        gist: 'Tenant = spec_pipeline.projects row.',
        reachedIn: 'cc-0709-d',
        age: '1w ago'
      }, {
        n: 2,
        title: 'Metering unit',
        status: 'reached',
        deps: [1],
        approach: 'grilling',
        gist: 'Meter on agent-run minutes, not tokens.',
        reachedIn: 'cc-0710-a',
        age: '5d ago'
      }, {
        n: 3,
        title: 'Plan tiers',
        status: 'claimed',
        deps: [2],
        approach: 'grilling',
        claimedBy: 'cc-0712-f',
        claimedFor: '31h',
        stuck: true
      }, {
        n: 4,
        title: 'Usage aggregation pipeline',
        status: 'marked',
        deps: [2],
        approach: 'research'
      }, {
        n: 5,
        title: 'Overage behavior',
        status: 'marked',
        deps: [3],
        approach: 'grilling'
      }, {
        n: 6,
        title: 'Invoice rendering',
        status: 'sighted',
        deps: [3]
      }, {
        n: 7,
        title: 'Free-tier abuse guardrails',
        status: 'sighted',
        deps: [4]
      }, {
        n: 8,
        title: 'Billing provider choice',
        status: 'marked',
        deps: [1],
        approach: 'research'
      }, {
        n: 9,
        title: 'Proration on plan change',
        status: 'sighted',
        deps: [3]
      }, {
        n: 10,
        title: 'Tax handling',
        status: 'sighted',
        deps: [8]
      }, {
        n: 11,
        title: 'Dunning flow',
        status: 'sighted',
        deps: [8]
      }],
      assets: [],
      terms: [{
        term: 'run minute',
        definition: 'One minute of executor wall-clock — the metering unit.'
      }]
    },
    'rate-limit-strategy': {
      id: 'rate-limit-strategy',
      title: 'Rate-limit strategy',
      status: 'active',
      trailhead: 'No rate limits anywhere — decide where they belong and how they behave.',
      destination: 'Rate-limit tiers ready to fold into the auth spec.',
      claimTtl: '24h',
      created: '3d ago',
      updated: '5h ago',
      waypoints: [{
        n: 1,
        title: 'Surfaces that need limits',
        status: 'reached',
        deps: [],
        approach: 'research',
        gist: 'MCP writes + web approve/deny only.',
        reachedIn: 'cc-0711-c',
        age: '3d ago'
      }, {
        n: 2,
        title: 'Keying strategy',
        status: 'reached',
        deps: [1],
        approach: 'grilling',
        gist: 'Key on actor, not IP.',
        reachedIn: 'cc-0712-b',
        age: '2d ago'
      }, {
        n: 3,
        title: 'Algorithm choice',
        status: 'reached',
        deps: [1],
        approach: 'research',
        gist: 'Token bucket in Postgres; no Redis.',
        reachedIn: 'cc-0712-b',
        age: '2d ago'
      }, {
        n: 4,
        title: 'Limit values per tier',
        status: 'reached',
        deps: [2, 3],
        approach: 'grilling',
        gist: 'Draft numbers set; validate under load.',
        reachedIn: 'cc-0713-a',
        age: '1d ago'
      }, {
        n: 5,
        title: '429 response contract',
        status: 'reached',
        deps: [3],
        approach: 'grilling',
        gist: 'Retry-After honored by both executors.',
        reachedIn: 'cc-0713-a',
        age: '1d ago'
      }, {
        n: 6,
        title: 'Burst allowance',
        status: 'marked',
        deps: [4],
        approach: 'grilling'
      }, {
        n: 7,
        title: 'Scheduler exemption',
        status: 'marked',
        deps: [4],
        approach: 'grilling'
      }, {
        n: 8,
        title: 'Observability of throttles',
        status: 'sighted',
        deps: [5]
      }],
      assets: [{
        kind: 'analysis',
        title: 'Token bucket in Postgres',
        wp: 3
      }],
      terms: []
    }
  },
  // public.runs — one detail per run: nodes, pending_human_interactions, run_events, artifacts_meta
  runDetails: {
    'run_5c18': {
      id: 'run_5c18',
      workflow: 'relentless-default',
      status: 'in_review',
      started: '18m ago',
      snapshot: 'b3d91f04',
      workspace: '/work/relentless/a1f3',
      claimedBy: 'scheduler-1',
      executor: '—',
      nodes: [{
        id: 'requirements.compile',
        kind: 'agent',
        status: 'done',
        dur: '3m 40s'
      }, {
        id: 'requirements.review',
        kind: 'guard',
        status: 'done',
        dur: '2s'
      }, {
        id: 'requirements.gate',
        kind: 'human',
        status: 'waiting',
        dur: '18m …'
      }, {
        id: 'design.compile',
        kind: 'agent',
        status: 'pending'
      }, {
        id: 'design.gate',
        kind: 'human',
        status: 'pending'
      }, {
        id: 'tasks.compile',
        kind: 'agent',
        status: 'pending'
      }, {
        id: 'tasks.gate',
        kind: 'human',
        status: 'pending'
      }],
      gate: {
        node: 'requirements.gate',
        prompt: 'Requirements for structured-logging-pipeline are ready. Approve to advance to design, or deny with a reason for the redraft.',
        allowedSignals: ['approve', 'deny'],
        deadline: null
      },
      artifacts: [{
        name: 'requirements.md',
        version: 2,
        node: 'requirements.compile',
        hash: '9c41e2ab',
        ts: '22m ago'
      }, {
        name: 'glossary.json',
        version: 1,
        node: 'requirements.compile',
        hash: '77d0f3c1',
        ts: '24m ago'
      }],
      events: [{
        seq: 1,
        type: 'run_started',
        ts: '14:01:02',
        detail: 'inputs: { spec: a1f3 }'
      }, {
        seq: 2,
        type: 'node_entered',
        ts: '14:01:02',
        detail: 'requirements.compile · executor claude'
      }, {
        seq: 3,
        type: 'artifact_written',
        ts: '14:03:11',
        detail: 'glossary.json v1 · 77d0f3c1'
      }, {
        seq: 4,
        type: 'artifact_written',
        ts: '14:04:38',
        detail: 'requirements.md v2 · 9c41e2ab'
      }, {
        seq: 5,
        type: 'node_exited',
        ts: '14:04:42',
        detail: 'requirements.compile · 3m 40s'
      }, {
        seq: 6,
        type: 'guard_passed',
        ts: '14:04:44',
        detail: 'requirements.review · reads satisfied'
      }, {
        seq: 7,
        type: 'human_gate_opened',
        ts: '14:04:45',
        detail: 'requirements.gate · signals: approve | deny'
      }]
    },
    'run_7f3a': {
      id: 'run_7f3a',
      workflow: 'relentless-default',
      status: 'running',
      started: '1m ago',
      snapshot: 'b3d91f04',
      workspace: '/work/relentless/a1f3',
      claimedBy: 'scheduler-1',
      executor: 'claude',
      nodes: [{
        id: 'requirements.compile',
        kind: 'agent',
        status: 'done',
        dur: '3m 40s'
      }, {
        id: 'requirements.review',
        kind: 'guard',
        status: 'done',
        dur: '2s'
      }, {
        id: 'requirements.gate',
        kind: 'human',
        status: 'done',
        dur: 'approved · 41m'
      }, {
        id: 'design.compile',
        kind: 'agent',
        status: 'running',
        dur: '1m …'
      }, {
        id: 'design.gate',
        kind: 'human',
        status: 'pending'
      }, {
        id: 'tasks.compile',
        kind: 'agent',
        status: 'pending'
      }, {
        id: 'tasks.gate',
        kind: 'human',
        status: 'pending'
      }],
      executing: {
        node: 'design.compile',
        agent: 'design-drafter',
        model: 'opus',
        elapsed: '1m 12s'
      },
      artifacts: [{
        name: 'requirements.md',
        version: 3,
        node: 'requirements.compile',
        hash: '4b8e11fc',
        ts: '46m ago'
      }],
      events: [{
        seq: 1,
        type: 'run_started',
        ts: '13:14:20',
        detail: 'inputs: { spec: a1f3 }'
      }, {
        seq: 2,
        type: 'node_exited',
        ts: '13:18:00',
        detail: 'requirements.compile · 3m 40s'
      }, {
        seq: 3,
        type: 'human_gate_resolved',
        ts: '13:59:04',
        detail: 'requirements.gate · approve · web-ui'
      }, {
        seq: 4,
        type: 'node_entered',
        ts: '13:59:06',
        detail: 'design.compile · executor claude · opus'
      }, {
        seq: 5,
        type: 'agent_turn',
        ts: '14:00:18',
        detail: 'design-drafter · reading requirements + codebase'
      }]
    },
    'run_2b90': {
      id: 'run_2b90',
      workflow: 'relentless-default',
      status: 'approved',
      started: '44m ago',
      ended: '12m ago',
      snapshot: 'b3d91f04',
      workspace: '/work/relentless/7b02',
      claimedBy: 'scheduler-2',
      executor: 'pi',
      nodes: [{
        id: 'requirements.compile',
        kind: 'agent',
        status: 'done',
        dur: '2m 58s'
      }, {
        id: 'requirements.gate',
        kind: 'human',
        status: 'done',
        dur: 'approved · 6m'
      }, {
        id: 'design.compile',
        kind: 'agent',
        status: 'done',
        dur: '7m 21s'
      }, {
        id: 'design.gate',
        kind: 'human',
        status: 'done',
        dur: 'approved · 9m'
      }, {
        id: 'tasks.compile',
        kind: 'agent',
        status: 'done',
        dur: '2m 05s'
      }, {
        id: 'tasks.gate',
        kind: 'human',
        status: 'done',
        dur: 'approved · 4m'
      }],
      summary: {
        headline: 'Run succeeded · ended 12m ago at tasks.gate',
        detail: 'All three stages approved. spec-implementation-orchestrator dispatches 22 tasks from here.'
      },
      artifacts: [{
        name: 'requirements.md',
        version: 1,
        node: 'requirements.compile',
        hash: 'c2a94e10',
        ts: '41m ago'
      }, {
        name: 'design.md',
        version: 2,
        node: 'design.compile',
        hash: 'f6d1082b',
        ts: '28m ago'
      }, {
        name: 'tasks.md',
        version: 1,
        node: 'tasks.compile',
        hash: '1e77ab9d',
        ts: '16m ago'
      }],
      events: [{
        seq: 1,
        type: 'run_started',
        ts: '13:18:44',
        detail: 'inputs: { spec: 7b02 }'
      }, {
        seq: 2,
        type: 'human_gate_resolved',
        ts: '13:27:51',
        detail: 'requirements.gate · approve · web-ui'
      }, {
        seq: 3,
        type: 'human_gate_resolved',
        ts: '13:44:19',
        detail: 'design.gate · approve · web-ui'
      }, {
        seq: 4,
        type: 'human_gate_resolved',
        ts: '13:50:33',
        detail: 'tasks.gate · approve · web-ui'
      }, {
        seq: 5,
        type: 'run_succeeded',
        ts: '13:50:34',
        detail: 'ended_at_node: tasks.gate'
      }]
    },
    'run_0d41': {
      id: 'run_0d41',
      workflow: 'nightly-audit',
      status: 'approved',
      started: '2h ago',
      ended: '2h ago',
      snapshot: '77aa02c9',
      workspace: '/work/relentless/nightly',
      claimedBy: 'scheduler-1',
      executor: '—',
      nodes: [{
        id: 'scan.collect',
        kind: 'script',
        status: 'done',
        dur: '14s'
      }, {
        id: 'scan.guard',
        kind: 'guard',
        status: 'done',
        dur: '1s'
      }, {
        id: 'scan.report',
        kind: 'script',
        status: 'done',
        dur: '3s'
      }],
      summary: {
        headline: 'Run succeeded · ended 2h ago at scan.report',
        detail: 'No guard violations: every audit_log row attributed to a known actor.'
      },
      artifacts: [{
        name: 'audit-report.md',
        version: 1,
        node: 'scan.report',
        hash: '90bc45e7',
        ts: '2h ago'
      }],
      events: [{
        seq: 1,
        type: 'run_started',
        ts: '12:00:00',
        detail: 'trigger: schedule · nightly'
      }, {
        seq: 2,
        type: 'guard_passed',
        ts: '12:00:15',
        detail: 'scan.guard · 0 violations'
      }, {
        seq: 3,
        type: 'run_succeeded',
        ts: '12:00:18',
        detail: 'ended_at_node: scan.report'
      }]
    },
    'run_9a2e': {
      id: 'run_9a2e',
      workflow: 'relentless-default',
      status: 'denied',
      started: '2h ago',
      ended: '1h ago',
      snapshot: 'b3d91f04',
      workspace: '/work/relentless/f230',
      claimedBy: 'scheduler-2',
      executor: 'claude',
      nodes: [{
        id: 'requirements.compile',
        kind: 'agent',
        status: 'done',
        dur: '3m 02s'
      }, {
        id: 'requirements.gate',
        kind: 'human',
        status: 'done',
        dur: 'approved · 11m'
      }, {
        id: 'design.compile',
        kind: 'agent',
        status: 'done',
        dur: '8m 44s'
      }, {
        id: 'design.gate',
        kind: 'human',
        status: 'denied',
        dur: 'denied · 1h ago'
      }, {
        id: 'tasks.compile',
        kind: 'agent',
        status: 'pending'
      }, {
        id: 'tasks.gate',
        kind: 'human',
        status: 'pending'
      }],
      resolvedGate: {
        node: 'design.gate',
        signal: 'deny',
        by: 'web-ui',
        ts: '1h ago',
        payload: 'Data model missing traceability to REQ-014.'
      },
      artifacts: [{
        name: 'requirements.md',
        version: 1,
        node: 'requirements.compile',
        hash: '5d20cf83',
        ts: '2h ago'
      }, {
        name: 'design.md',
        version: 1,
        node: 'design.compile',
        hash: 'e09b7714',
        ts: '1h ago'
      }],
      events: [{
        seq: 1,
        type: 'run_started',
        ts: '12:04:10',
        detail: 'inputs: { spec: f230 }'
      }, {
        seq: 2,
        type: 'human_gate_resolved',
        ts: '12:18:40',
        detail: 'requirements.gate · approve · web-ui'
      }, {
        seq: 3,
        type: 'node_exited',
        ts: '12:27:24',
        detail: 'design.compile · 8m 44s'
      }, {
        seq: 4,
        type: 'human_gate_resolved',
        ts: '13:02:51',
        detail: 'design.gate · deny · web-ui'
      }, {
        seq: 5,
        type: 'run_ended',
        ts: '13:02:52',
        detail: 'ended_at_node: design.gate · deny payload returned to design-drafter'
      }]
    }
  }
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/data.js", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.CardBody = __ds_scope.CardBody;

__ds_ns.CardEyebrow = __ds_scope.CardEyebrow;

__ds_ns.CardTitle = __ds_scope.CardTitle;

__ds_ns.CardFooter = __ds_scope.CardFooter;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Tag = __ds_scope.Tag;

__ds_ns.Dialog = __ds_scope.Dialog;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.Tooltip = __ds_scope.Tooltip;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Radio = __ds_scope.Radio;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Textarea = __ds_scope.Textarea;

__ds_ns.Tabs = __ds_scope.Tabs;

__ds_ns.StageStepper = __ds_scope.StageStepper;

__ds_ns.StatusBadge = __ds_scope.StatusBadge;

})();
