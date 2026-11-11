import { createContext } from 'react';

export const CFBypassIsOpenContext = createContext({
  isOpen: false,
  url: '',
  isLogin: false,
  setIsOpen: (_isOpen: boolean, _url?: string, _isLogin?: boolean) => {},
});

export const setWebViewOpen = { openWebViewCF: (_isOpen: boolean, _url: string, _isLogin: boolean = false) => {} };
