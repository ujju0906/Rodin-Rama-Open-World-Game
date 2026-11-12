/** Controls the loading overlay defined in index.html. */
export class LoadingScreen {
  private readonly root = document.getElementById('loading')!;
  private readonly bar = document.getElementById('loading-bar')!;
  private readonly label = document.getElementById('loading-label')!;
  private readonly begin = document.getElementById('loading-begin') as HTMLButtonElement;

  constructor() {
    // Title key art (Higgsfield) behind the title.
    const art = document.getElementById('loading-art');
    if (art) art.style.backgroundImage = `url(${import.meta.env.BASE_URL}art/title.jpg)`;
  }

  setProgress(fraction: number, text: string): void {
    this.bar.style.transform = `scaleX(${Math.min(1, Math.max(0, fraction))})`;
    this.label.textContent = text;
  }

  /** Shows the "Begin" button and resolves when the player clicks it (or presses Enter). */
  waitForBegin(): Promise<void> {
    this.root.classList.add('ready');
    this.label.textContent = '';
    return new Promise((resolve) => {
      const go = (): void => {
        this.begin.removeEventListener('click', go);
        window.removeEventListener('keydown', onKey);
        resolve();
      };
      const onKey = (e: KeyboardEvent): void => {
        if (e.key === 'Enter' || e.key === ' ') go();
      };
      this.begin.addEventListener('click', go);
      window.addEventListener('keydown', onKey);
      this.begin.focus();
    });
  }

  hide(): void {
    this.root.classList.add('done');
    setTimeout(() => this.root.remove(), 1600);
  }
}
