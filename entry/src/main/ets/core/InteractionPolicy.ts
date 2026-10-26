export class InteractionPolicy {
  static mode(value: string): string { return ['auto', 'left', 'right'].includes(value) ? value : 'auto'; }
  static left(mode: string, holdingStatus: number): boolean {
    return mode === 'left' || (mode === 'auto' && holdingStatus === 1);
  }
  static holdingLabel(status: number): string {
    if (status === 1) return '左手握持';
    if (status === 2) return '右手握持';
    if (status === 3) return '双手握持';
    if (status === 0) return '未握持';
    return '等待握持状态';
  }
}
