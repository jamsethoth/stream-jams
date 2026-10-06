import { SafeHttpError } from "../../http/safe-http-error.js";
import { createHash, randomUUID } from "node:crypto";
import type { TimerAdjustment, TimerCommandResult, TimerRunState } from "@stream-jams/core";
import type { PlaybackOperationsService } from "../playback/playback-operations-service.js";

export class AutomationControlError extends SafeHttpError {
  constructor(statusCode: number, code: string, message: string, options?: ErrorOptions) { super("AutomationControlError", statusCode, code, message, options); }
}
interface Grant { readonly scopes: readonly string[]; }
interface TimerControl {
  listStates(): readonly TimerRunState[];
  activate(id:string, generation:string|null): Promise<TimerCommandResult>;
  reset(id:string, generation:string): Promise<TimerCommandResult>;
  stopActive(id:string, generation:string): Promise<TimerCommandResult>;
  adjustActive(id:string, input:TimerAdjustment, generation:string): Promise<TimerCommandResult>;
  togglePaused(): Promise<{changed:boolean;states:readonly TimerRunState[]}>;
}
type ModuleId = "alerts" | "screen-effects";
type Guard = { readonly observedRuntimeId:string };
export type AutomationCommand = Guard & (
  | {kind:"activate";timerId:string;expectedGeneration:string|null}
  | {kind:"reset"|"stop";timerId:string;expectedGeneration:string}
  | {kind:"adjust";timerId:string;expectedGeneration:string;action:"increment"|"decrement";amountMs:number}
  | {kind:"toggle-timers"}
  | {kind:"toggle-pause";moduleId:ModuleId}
  | {kind:"skip";moduleId:ModuleId;expectedOccurrenceId:string|null}
  | {kind:"clear";moduleId:ModuleId;expectedQueueRevision:string;expectedPendingCount:number}
  | {kind:"toggle-mute";moduleIds:ModuleId[]}
);
interface Options {
  readonly timers:TimerControl;
  readonly definitions:{listDefinitions():readonly {id:string;label:string}[]};
  readonly playback:PlaybackOperationsService;
  readonly now?:()=>number;
  readonly runtimeId?:string;
  readonly runCommand?: <T>(work:()=>Promise<T>)=>Promise<T>;
}
export class AutomationControlService {
  #runtimeId:string;
  #revision=0;
  #fingerprint="";
  readonly #now:()=>number;
  constructor(readonly options:Options) { this.#runtimeId=options.runtimeId??randomUUID();this.#now=options.now??Date.now; }
  invalidateRuntime():void { this.#runtimeId=randomUUID();this.#revision=0;this.#fingerprint=""; }
  capabilities(grant:Grant) {
    return {apiVersion:1,capabilities:[...grant.scopes],limits:{maxAdjustmentMs:2592000000},pollIntervalMs:1000};
  }
  snapshot(grant:Grant) {
    const runs = new Map(this.options.timers.listStates().map(run=>[run.definitionId,run]));
    const timers=this.options.definitions.listDefinitions().map(({id,label})=>({id,label,state:serializeState(runs.get(id))}));
    const source=this.options.playback.getSnapshot();
    const mutes=this.options.playback.getModuleMuteState();
    const outputStatus=this.options.playback.getMuteOutputStatus();
    const playback=source.owners.filter(owner=>isModule(owner.moduleId)).map(owner=>{
      const moduleId=owner.moduleId as ModuleId;
      const pendingIds=source.queued.filter(row=>row.moduleId===moduleId).map(row=>row.occurrenceId);
      return {moduleId,paused:owner.paused,muted:mutes[moduleId],muteOutputStatus:outputStatus,
        blockedBy:[...(source.paused?["global-pause"]:[]),...(source.doNotDisturb?["do-not-disturb"]:[]),...(owner.paused?["module-pause"]:[])],
        pendingCount:pendingIds.length,queueRevision:queueRevision(pendingIds),currentOccurrenceId:source.current.find(row=>row.moduleId===moduleId)?.occurrenceId??null};
    });
    const fingerprint=JSON.stringify({timers,playback});
    if(this.#fingerprint!==fingerprint){this.#fingerprint=fingerprint;this.#revision++;}
    return {...this.capabilities(grant),runtimeId:this.#runtimeId,revision:this.#revision,serverTimeEpochMs:this.#now(),
      timers:grant.scopes.includes("timers:read")?timers:[],playback:grant.scopes.includes("playback:read")?playback:[]};
  }
  async command(grant:Grant,command:AutomationCommand) {
    const execute=async()=>{
      if(command.observedRuntimeId!==this.#runtimeId)throw new AutomationControlError(409,"AUTOMATION_RUNTIME_CHANGED","Runtime changed. Refresh before issuing another command.");
      let changed=true;
      if("timerId" in command || command.kind==="toggle-timers") {
        requireScope(grant,"timers:control");
        if("timerId" in command && !this.options.definitions.listDefinitions().some(item=>item.id===command.timerId))throw new AutomationControlError(404,"TIMER_NOT_FOUND","Timer not found.");
        const timers=this.options.timers;
        switch(command.kind){
          case "activate":changed=(await timers.activate(command.timerId,command.expectedGeneration)).changed;break;
          case "reset":changed=(await timers.reset(command.timerId,command.expectedGeneration)).changed;break;
          case "stop":changed=(await timers.stopActive(command.timerId,command.expectedGeneration)).changed;break;
          case "adjust":changed=(await timers.adjustActive(command.timerId,{action:command.action,amountMs:command.amountMs},command.expectedGeneration)).changed;break;
          case "toggle-timers":changed=(await timers.togglePaused()).changed;break;
        }
      } else {
        const playback=this.options.playback;
        if(command.kind==="toggle-mute") {
          for(const moduleId of command.moduleIds)requireScope(grant,`playback:mute:${moduleId}`);
          await playback.toggleModulesMuted(command.moduleIds);
        }else{
          requireScope(grant,`playback:${command.kind==="toggle-pause"?"pause":command.kind}:${command.moduleId}`);
          if(command.kind==="toggle-pause")await playback.toggleModulePaused(command.moduleId);
          if(command.kind==="skip"){
            const current=playback.getSnapshot().current.find(row=>row.moduleId===command.moduleId)?.occurrenceId??null;
            if(current!==command.expectedOccurrenceId)throw new AutomationControlError(409,"AUTOMATION_STATE_CONFLICT","Current playback changed. Refresh and choose again.");
            if(current===null)changed=false;else await playback.skip(command.moduleId,current);
          }
          if(command.kind==="clear"){
            const ids=playback.getSnapshot().queued.filter(row=>row.moduleId===command.moduleId).map(row=>row.occurrenceId);
            if(queueRevision(ids)!==command.expectedQueueRevision||ids.length!==command.expectedPendingCount)throw new AutomationControlError(409,"AUTOMATION_STATE_CONFLICT","Pending queue changed. Review it before clearing.");
            changed=ids.length>0;
            await playback.clearPendingGuarded(command.moduleId,command.expectedPendingCount,ids);
          }
        }
      }
      return {changed,outcome:changed?"applied" as const:"unchanged" as const,state:this.snapshot(grant)};
    };
    return this.options.runCommand===undefined?execute():this.options.runCommand(execute);
  }
}
export function requireScope(grant:Grant,scope:string):void {
  if(!grant.scopes.includes(scope))throw new AutomationControlError(403,"AUTOMATION_SCOPE_REQUIRED","This installation has not been granted this operation.");
}
function isModule(id:string):id is ModuleId{return id==="alerts"||id==="screen-effects";}
function queueRevision(ids:readonly string[]):string{return createHash("sha256").update(JSON.stringify(ids)).digest("hex");}
function serializeState(state:TimerRunState|undefined){
  if(state===undefined)return null;
  const base={status:state.status,generation:state.generation};
  if(state.status==="running")return {...base,status:state.status,endsAtEpochMs:state.endsAtEpochMs};
  if(state.status==="paused")return {...base,status:state.status,remainingMs:state.remainingMs};
  return {...base,status:state.status,completedAtEpochMs:state.completedAtEpochMs,expiresAtEpochMs:state.expiresAtEpochMs};
}
