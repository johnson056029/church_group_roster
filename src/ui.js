import DOMPurify from 'dompurify';

export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
}

// Templates use data-click/data-change; never execute strings with eval/Function.
export function setHTML(element, html) {
  element.innerHTML = DOMPurify.sanitize(html);
}
function argumentValue(token, element) {
  if (token === 'this.value') return element.value;
  if (token === 'this.checked') return element.checked;
  if (token === 'true') return true;
  if (token === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(token)) return Number(token);
  if (/^'[^'\\]*'$/.test(token)) return token.slice(1, -1);
  throw new Error('無效的操作參數');
}
export function bindActions(actions) {
  for (const eventName of ['click', 'change']) document.addEventListener(eventName, async event => {
    const element = event.target.closest(`[data-${eventName}]`);
    if (!element || element.disabled) return;
    try {
      for (const expression of element.dataset[eventName].split(';').filter(Boolean)) {
        const match = expression.trim().match(/^(\w+)\((.*)\)$/);
        if (!match || !Object.hasOwn(actions, match[1])) throw new Error('未知操作');
        const tokens = match[2].match(/'[^'\\]*'|this\.(?:value|checked)|true|false|-?\d+(?:\.\d+)?/g) || [];
        if (tokens.join(',') !== match[2].replace(/\s*,\s*/g, ',')) throw new Error('無效的操作');
        await actions[match[1]](...tokens.map(token => argumentValue(token, element)));
      }
    } catch (error) { alert(`操作未完成：${error.message}`); }
  });
}
