import { createContext } from 'react';

export const CFBypassIsOpenContext = createContext({
  isOpen: false,
  url: '',
  setIsOpen: (_isOpen: boolean) => {},
});
// export class CFCookie {
//         return this.#cookie;

export const setWebViewOpen = { openWebViewCF: (_isOpen: boolean, _url: string) => {} };
