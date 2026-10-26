import { Projections, ServerItem } from './NativeModels';

export class SessionPresentation {
  static projectedTitle(projections?: Projections): string {
    const values = projections?.values;
    for (const value of [values?.title, values?.sessionTitle, values?.['session.title']]) {
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
  }
  static title(item: ServerItem): string {
    return SessionPresentation.projectedTitle(item.projections) ||
      (typeof item.title === 'string' ? item.title.trim() : '') || '新会话';
  }
}
