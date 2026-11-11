export class SourceError extends Error {
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  constructor(message:string,public readonly stop=false,options:{retryable?:boolean;retryAfterMs?:number}={}) {
    super(message);
    this.name='SourceError';
    this.retryable=options.retryable??!stop;
    this.retryAfterMs=options.retryAfterMs;
  }
}

export function responseFailure(label:string,response:Response) {
  const status=response.status;
  const limited=[401,403,429,999].includes(status);
  const transient=[408,425,429].includes(status)||(status>=500&&status<=599);
  const header=response.headers.get('retry-after');
  const seconds=header!==null&&header.trim()!==''?Number(header):NaN;
  const retryAfterMs=header===null?undefined:Number.isFinite(seconds)?Math.max(0,seconds*1000):Math.max(0,Date.parse(header)-Date.now());
  return new SourceError(`${label}: HTTP ${status}. This source was skipped.`,limited,{retryable:transient,retryAfterMs:Number.isFinite(retryAfterMs)?retryAfterMs:undefined});
}
