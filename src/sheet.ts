import { importPhoto } from './photo';

export interface SheetValues {
  name: string;
  target: number;
  /** undefined: unchanged, null: removed */
  photo?: Blob | null;
}

export interface SheetHandlers {
  save(v: SheetValues): void;
  create(v: SheetValues): void;
  reset(): void;
  remove(): void;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/**
 * Settings / create sheet. Destructive actions are confirmed by a second tap inside the sheet:
 * native confirm() is suppressed in some webviews and standalone PWAs, where it silently returns false.
 */
export class Sheet {
  private dialog = $<HTMLDialogElement>('settings');
  private name = $<HTMLInputElement>('fName');
  private target = $<HTMLInputElement>('fTarget');
  private file = $<HTMLInputElement>('fPhoto');
  private thumb = $('photoThumb');
  private clear = $<HTMLButtonElement>('photoClear');
  private deleteBtn = $<HTMLButtonElement>('deleteBtn');
  private photo: Blob | null | undefined;
  private thumbUrl = '';
  private disarmers: (() => void)[] = [];

  constructor(private h: SheetHandlers) {
    this.armed($<HTMLButtonElement>('resetBtn'), 'Обнулить', 'reset');
    this.armed(this.deleteBtn, 'Удалить', 'delete');

    this.file.addEventListener('change', async () => {
      const f = this.file.files?.[0];
      this.file.value = '';
      if (!f) return;
      try {
        this.photo = await importPhoto(f);
        this.showThumb(this.photo);
      } catch {
        this.thumb.title = 'Не получилось открыть фото';
      }
    });
    this.clear.addEventListener('click', () => {
      this.photo = null;
      this.showThumb(null);
    });

    this.dialog.addEventListener('close', () => {
      this.disarmers.forEach((d) => d());
      const v = (): SheetValues => ({
        name: this.name.value.trim(),
        target: Math.round(Number(this.target.value)),
        photo: this.photo,
      });
      switch (this.dialog.returnValue) {
        case 'save':
          this.h.save(v());
          break;
        case 'create':
          this.h.create(v());
          break;
        case 'reset':
          this.h.reset();
          break;
        case 'delete':
          this.h.remove();
          break;
      }
      this.showThumb(null);
    });
  }

  get isOpen() {
    return this.dialog.open;
  }

  open(mode: 'edit' | 'create', opts: { name?: string; target?: number; photo?: Blob; canDelete?: boolean } = {}) {
    const create = mode === 'create';
    $('sheetTitle').textContent = create ? 'Новая копилка' : 'Копилка';
    $('editActions').hidden = create;
    $('createActions').hidden = !create;
    this.deleteBtn.hidden = !opts.canDelete;
    this.name.value = opts.name ?? '';
    this.name.placeholder = 'Например, отпуск';
    this.target.value = String(opts.target ?? 50000);
    this.photo = undefined;
    this.showThumb(opts.photo ?? null);
    this.disarmers.forEach((d) => d());
    this.dialog.returnValue = '';
    this.dialog.showModal();
    if (create) setTimeout(() => this.name.focus(), 50);
  }

  private showThumb(blob: Blob | null) {
    if (this.thumbUrl) URL.revokeObjectURL(this.thumbUrl);
    this.thumbUrl = blob ? URL.createObjectURL(blob) : '';
    this.thumb.style.backgroundImage = blob ? `url("${this.thumbUrl}")` : '';
    this.thumb.classList.toggle('has', !!blob);
    this.clear.hidden = !blob;
  }

  private armed(btn: HTMLButtonElement, label: string, value: string) {
    let timer = 0;
    const disarm = () => {
      clearTimeout(timer);
      btn.classList.remove('armed');
      btn.textContent = label;
    };
    this.disarmers.push(disarm);
    btn.addEventListener('click', () => {
      if (btn.classList.contains('armed')) {
        disarm();
        this.dialog.close(value);
        return;
      }
      this.disarmers.forEach((d) => d());
      btn.classList.add('armed');
      btn.textContent = 'Точно? Ещё раз';
      timer = window.setTimeout(disarm, 3000);
    });
  }
}
