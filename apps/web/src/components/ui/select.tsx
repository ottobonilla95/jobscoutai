'use client';

import React, {type ComponentPropsWithRef} from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import {Check, ChevronDown, ChevronUp} from 'lucide-react';

export type SelectOption = {value:string|number;label:string;disabled?:boolean};
type SelectProps = Pick<ComponentPropsWithRef<'button'>,'id'|'aria-label'|'aria-labelledby'|'aria-describedby'|'aria-invalid'|'disabled'|'onBlur'|'ref'> & {
  value:string|number;
  options:readonly SelectOption[];
  onValueChange:(value:string)=>void;
  size?:'default'|'compact';
};

// Encode every value so empty-string options (New CV, More views) remain selectable.
const encode = (value:string|number) => `value:${value}`;

export function Select({value,options,onValueChange,size='default',disabled,...triggerProps}:SelectProps){
  const selected=options.find(option=>String(option.value)===String(value));
  return <SelectPrimitive.Root value={encode(value)} onValueChange={next=>onValueChange(next.slice(6))} disabled={disabled}>
    <SelectPrimitive.Trigger {...triggerProps} className={`ui-select-trigger ui-select-${size}`}>
      <span className="ui-select-value"><SelectPrimitive.Value>{selected?.label}</SelectPrimitive.Value></span>
      <SelectPrimitive.Icon className="ui-select-icon"><ChevronDown size={16} aria-hidden="true"/></SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content className="ui-select-content" position="popper" sideOffset={6} collisionPadding={12}>
        <SelectPrimitive.ScrollUpButton className="ui-select-scroll"><ChevronUp size={16} aria-hidden="true"/></SelectPrimitive.ScrollUpButton>
        <SelectPrimitive.Viewport className="ui-select-viewport">
          {options.map(option=><SelectPrimitive.Item key={encode(option.value)} value={encode(option.value)} disabled={option.disabled} className="ui-select-item">
            <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
            <SelectPrimitive.ItemIndicator className="ui-select-check"><Check size={16} aria-hidden="true"/></SelectPrimitive.ItemIndicator>
          </SelectPrimitive.Item>)}
        </SelectPrimitive.Viewport>
        <SelectPrimitive.ScrollDownButton className="ui-select-scroll"><ChevronDown size={16} aria-hidden="true"/></SelectPrimitive.ScrollDownButton>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  </SelectPrimitive.Root>;
}
