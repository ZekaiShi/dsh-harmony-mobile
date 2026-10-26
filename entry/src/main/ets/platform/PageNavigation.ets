// One contract for all in-mode page changes: native push forward, native pop back.
export class PageNavigation {
  paths: NavPathStack = new NavPathStack();
  private root: string;
  constructor(root: string) { this.root = root; }
  forward(page: string, fresh: boolean = false, replaceCurrent: boolean = false): void {
    const names = this.paths.getAllPathName();
    if (replaceCurrent && names.length && names[names.length - 1] === page) { this.paths.replacePath({ name: page }, true); return; }
    if (!fresh && (names[names.length - 1] || this.root) === page) return;
    this.paths.pushPath({ name: page }, true);
  }
  backward(page: string): void {
    if (page === this.root) { this.paths.clear(true); return; }
    const index = this.paths.getAllPathName().lastIndexOf(page);
    if (index >= 0) this.paths.popToIndex(index, true);
    else this.paths.replacePath({ name: page }, true);
  }
}
