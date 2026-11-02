import { ModelMetadata } from '../../types/model';

export function chatExecutionStatus(model: ModelMetadata | null, desktopConnected: boolean): { label: string; detail: string; desktop: boolean } {
  if (!model) return {label:'Select a model',detail:'Download a phone model or connect to your desktop.',desktop:false};
  const provider=model.provider || (model.source==='online'?'ollama':model.source==='cloud'?'gemini':'device');
  if(provider==='device')return {label:'On this phone · Offline',detail:'Replies run on this phone. Internet and desktop access are not required after model download.',desktop:false};
  if(provider==='ollama')return {label:desktopConnected?'Desktop · Connected':'Desktop · Unavailable',detail:desktopConnected?'Replies run on your paired computer, not on this phone.':'Reconnect your desktop or select a downloaded phone model. Your request will not be replayed automatically.',desktop:true};
  return {label:'Cloud · Internet required',detail:'Requests use your selected cloud provider. A network connection and configured credentials are required.',desktop:false};
}
