import React, {type ComponentPropsWithRef} from 'react';

/** Shared suggestion surface; callers keep their existing search and keyboard behavior. */
export function Listbox({className='',...props}:ComponentPropsWithRef<'ul'>){
  return <ul {...props} role="listbox" className={`ui-listbox ${className}`}/>;
}

export function ListboxOption({className='',...props}:ComponentPropsWithRef<'button'>){
  return <button {...props} type="button" role="option" className={`ui-listbox-option ${className}`}/>;
}
