const DISARM_MS = 3000;

/**
 * Two-tap confirmation on the main screen: the first tap arms the button, the second one runs the action.
 * Native confirm() is suppressed in some webviews and standalone PWAs, where it silently returns false.
 * `labels` returns [idle, armed] texts for the current state, or null when the button has nothing to do.
 */
export function armed(btn: HTMLElement, text: HTMLElement, labels: () => [string, string] | null, run: () => void) {
  let timer = 0;
  const disarm = () => {
    clearTimeout(timer);
    btn.classList.remove('armed');
    refresh();
  };
  const refresh = () => {
    const l = labels();
    btn.classList.toggle('off', !l);
    if (l) text.textContent = btn.classList.contains('armed') ? l[1] : l[0];
  };
  btn.addEventListener('click', () => {
    if (!labels()) return;
    if (btn.classList.contains('armed')) {
      disarm();
      run();
      refresh();
      return;
    }
    btn.classList.add('armed');
    refresh();
    timer = window.setTimeout(disarm, DISARM_MS);
  });
  return { refresh, disarm };
}
