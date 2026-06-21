'use client';

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  PresentationScript,
  Presenter,
  TemplateHandle,
  TextBoxHandle,
} from '@lenzon/player';

type StudioContextValue = {
  presenterRef: React.MutableRefObject<Presenter | null>;
  lastBoxRef: React.MutableRefObject<TextBoxHandle | null>;
  lastTemplateRef: React.MutableRefObject<TemplateHandle | null>;
  currentScriptRef: React.MutableRefObject<PresentationScript | null>;
  currentScriptIdRef: React.MutableRefObject<string | null>;
  currentAnalysisIdRef: React.MutableRefObject<string | null>;
  ready: boolean;
  handlePresenterReady: (presenter: Presenter) => void;
  clearAll: () => void;
};

const StudioContext = createContext<StudioContextValue | null>(null);

export function StudioProvider({ children }: { children: ReactNode }) {
  const presenterRef = useRef<Presenter | null>(null);
  const lastBoxRef = useRef<TextBoxHandle | null>(null);
  const lastTemplateRef = useRef<TemplateHandle | null>(null);
  const currentScriptRef = useRef<PresentationScript | null>(null);
  const currentScriptIdRef = useRef<string | null>(null);
  const currentAnalysisIdRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);

  const handlePresenterReady = useCallback((presenter: Presenter) => {
    presenterRef.current = presenter;
    setReady(true);
  }, []);

  const clearAll = useCallback(() => {
    lastTemplateRef.current?.dismiss();
    lastBoxRef.current?.dismiss();
    lastBoxRef.current = null;
    lastTemplateRef.current = null;
    presenterRef.current?.clear();
  }, []);

  return (
    <StudioContext.Provider
      value={{
        presenterRef,
        lastBoxRef,
        lastTemplateRef,
        currentScriptRef,
        currentScriptIdRef,
        currentAnalysisIdRef,
        ready,
        handlePresenterReady,
        clearAll,
      }}
    >
      {children}
    </StudioContext.Provider>
  );
}

export function useStudio(): StudioContextValue {
  const ctx = useContext(StudioContext);
  if (!ctx) {
    throw new Error('useStudio must be used inside <StudioProvider>');
  }
  return ctx;
}

export function usePresenter() {
  const { presenterRef, ready } = useStudio();
  return { presenterRef, ready };
}
