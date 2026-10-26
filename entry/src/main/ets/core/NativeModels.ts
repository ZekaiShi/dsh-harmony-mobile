export interface WireContent {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  arguments?: Object;
  toolCallId?: string;
  isError?: boolean;
  content?: WireContent[];
}
export interface WireMessage { source?: WireSource; content?: WireContent[]; }
export interface WireSource { kind: string; }
export interface WireChunk { type: string; index?: number; text?: string; delta?: string; }
export interface WireData {
  commandId?: string; kind?: string; text?: string;
  turn?: string | number; step?: string | number; stepId?: string;
  message?: WireMessage; chunk?: WireChunk; content?: WireContent[];
  source?: WireSource; callId?: string; name?: string; arguments?: Object; error?: Object;
}
export interface WireEvent { type?: string; time?: number; data?: WireData; }
export interface WireRecord extends WireEvent { seq?: number; event?: WireEvent; }
export interface TodoItem { content?: string; text?: string; status: string; }
export interface TodoProjection { items?: TodoItem[]; todos?: TodoItem[]; }
export interface ProjectionValues { title?: string; sessionTitle?: string; 'session.title'?: string; todo?: TodoProjection; todos?: TodoProjection; }
export interface Projections { asOfSeq?: number; values?: ProjectionValues; }
export interface ServerItem {
  workspaceId?: string; sessionId?: string; title?: string; path?: string; sessionIds?: string[];
  updatedAt?: number; running?: boolean; blank?: boolean; agentPreset?: string; projections?: Projections;
}
export interface QuestionOption { label: string; description?: string; }
export interface MobileQuestion { id: string; question: string; header?: string; options?: QuestionOption[]; multiSelect?: boolean; }
export interface QuestionAnswer { id: string; selected: string[]; custom?: string; }
export interface PendingQuestion { rpcId: string; sessionId: string; questions: MobileQuestion[]; }
export interface RpcValue {
  items?: ServerItem[]; archivedSessionIds?: string[]; events?: WireRecord[]; projections?: Projections;
  sessionId?: string; agentPreset?: string; rpcId?: string; questions?: MobileQuestion[];
  hasMore?: boolean; connected?: boolean; tunnelExpiresAt?: number;
}
export interface RpcPayload {
  workspaceId?: string; sessionId?: string; maxMessages?: number; mode?: string;
  content?: WireContent[]; clientTimeZone?: string; rpcId?: string; answers?: QuestionAnswer[];
}
export interface RpcEnvelope { ok: boolean; value?: RpcValue | null; error?: string; rescan?: boolean; retryAfter?: number; }
export interface RpcRequest { method: string; payload: RpcPayload; }
export interface WireRequest { url: string; method: string; body: string; cookie: string; origin: string; }
export interface WireResponse { status: number; body: string; cookie: string; location: string; }
export interface SseFrame { event: string; data: string; }
export interface StreamHandle { close(): void; }
export interface MobileTransport {
  request(request: WireRequest): Promise<WireResponse>;
  stream(request: WireRequest, frame: (value: SseFrame) => void, state: (connected: boolean) => void): StreamHandle;
}
export interface CredentialStore {
  load(origin: string): Promise<string>;
  save(origin: string, cookie: string): Promise<void>;
  remove(origin: string): Promise<void>;
}
export interface PairOutcome { pinRequired: boolean; migrationUrl: string; }
export interface SnapshotFrame { records?: WireRecord[]; projections?: Projections; }
export class ChatBlock {
  kind: string = 'text'; text: string = ''; name: string = ''; id: string = ''; status: string = ''; key: string = '';
  category: string = 'tool'; summary: string = '';
}
export class ChatMessage {
  id: string = ''; role: string = 'assistant'; blocks: ChatBlock[] = []; streaming: boolean = false; version: number = 0;
}
export class ChatProjection { messages: ChatMessage[] = []; running: boolean = false; }
