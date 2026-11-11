/** An exact mixed-package quote still cannot establish guaranteed base cash. */
export function explicitBasePay(quote:string){
 return /\b(base|guaranteed|fixed|salario base|sueldo base|garantizado|fijo)\b/i.test(quote)&&
  !/\b(bonus|bonuses|commission|variable|total|ote|equity|stock|options|bonificaci[oó]n|comisi[oó]n|acciones)\b/i.test(quote);
}
