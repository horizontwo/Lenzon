'use client';

import { useState } from 'react';
import '@lenzon/player/styles.css';
import { StudioProvider, useStudio } from './StudioProvider';
import { StagePanel } from './panels/StagePanel';
import { ToolbarScripts } from './panels/ToolbarScripts';
import { ToolbarTemplates } from './panels/ToolbarTemplates';
import { ToolbarEffects } from './panels/ToolbarEffects';
import { ToolbarLenses } from './panels/ToolbarLenses';
import { ToolbarBlog } from './panels/ToolbarBlog';
import { ToolbarPr } from './panels/ToolbarPr';
import { FlagModal } from './panels/FlagModal';
import { ExportModal } from '@lenzon/player/pipeline/ExportModal';
import { ScriptLoader } from './panels/ScriptLoader';
import { StackStampStrip } from './panels/StackStampStrip';
import { useScriptPlayer } from './hooks/useScriptPlayer';
import { useStackStamp } from './hooks/useStackStamp';

type Tab = 'templates' | 'scripts' | 'fx' | 'lenses' | 'blog' | 'pr';

export default function StudioShell({ userEmail }: { userEmail: string }) {
  return (
    <StudioProvider>
      <ShellChrome userEmail={userEmail} />
    </StudioProvider>
  );
}

function ShellChrome({ userEmail }: { userEmail: string }) {
  const { ready, clearAll, currentScriptRef } = useStudio();
  const player = useScriptPlayer();
  const head = useStackStamp();
  const [activeTab, setActiveTab] = useState<Tab>('scripts');
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagSavedId, setFlagSavedId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [demoTemplateId, setDemoTemplateId] = useState<string | null>(null);

  const openFlag = () => {
    if (!player.loadedScript) return;
    player.pause();
    setFlagSavedId(null);
    setFlagOpen(true);
  };

  const openExport = () => {
    if (!player.loadedScriptId) return;
    player.pause();
    setExportOpen(true);
  };

  // When a script is loaded, the playing scene drives the stamp. Otherwise
  // fall back to whichever demo template the user just ran, so the stamp
  // still shows template@version on the Templates tab.
  const scriptSceneTemplateId =
    currentScriptRef.current?.scenes[player.scenePos.index]?.primitive
      ?.template ?? null;
  const sceneTemplateId = player.loadedScript
    ? scriptSceneTemplateId
    : demoTemplateId;

  const tabEnabled: Record<Tab, boolean> = {
    templates: true,
    scripts: true,
    fx: true,
    lenses: true,
    blog: true,
    pr: true,
  };

  return (
    <div className="sb-app">
      <header className="sb-toolbar sb-toolbar-top">
        <h1>Lenzon — Studio v2</h1>
        <div className="sb-toolbar-group" aria-label="Tabs">
          {(['templates', 'scripts', 'fx', 'lenses', 'blog', 'pr'] as Tab[]).map((t) => {
            const enabled = tabEnabled[t];
            return (
              <button
                key={t}
                disabled={!enabled}
                aria-pressed={t === activeTab}
                onClick={() => enabled && setActiveTab(t)}
                style={
                  t === activeTab
                    ? { fontWeight: 700, textDecoration: 'underline' }
                    : undefined
                }
              >
                {t}
              </button>
            );
          })}
          <a
            href="/studio"
            title="Legacy studio (hosts PipelinePanel)"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '0 8px',
              textDecoration: 'none',
            }}
          >
            pipeline ↗
          </a>
        </div>
        <div className="sb-toolbar-group sb-toolbar-spacer">
          <button
            disabled={!ready}
            onClick={() => {
              clearAll();
              setDemoTemplateId(null);
            }}
          >
            clear
          </button>
          {flagSavedId && (
            <span className="sb-toolbar-label" style={{ color: '#6ee7b7' }}>
              note saved
            </span>
          )}
          <span className="sb-toolbar-label">{userEmail}</span>
          <a
            href="/studio"
            className="sb-toolbar-label"
            style={{ textDecoration: 'underline' }}
          >
            ← /studio
          </a>
        </div>
      </header>
      <div className="sb-toolbar sb-toolbar-sub">
        {activeTab === 'scripts' && (
          <>
            <ScriptLoader player={player} />
            <ToolbarScripts
              player={player}
              onOpenFlag={openFlag}
              onOpenExport={openExport}
            />
          </>
        )}
        {activeTab === 'templates' && (
          <ToolbarTemplates onTemplateRun={setDemoTemplateId} />
        )}
        {activeTab === 'fx' && <ToolbarEffects />}
        {activeTab === 'lenses' && <ToolbarLenses />}
        {activeTab === 'blog' && <ToolbarBlog />}
        {activeTab === 'pr' && (
          <ToolbarPr
            player={player}
            onScriptLoaded={() => setActiveTab('scripts')}
          />
        )}
      </div>
      <StackStampStrip
        head={head}
        captured={player.capturedStamp}
        sceneTemplateId={sceneTemplateId}
      />
      <StagePanel />
      <FlagModal
        open={flagOpen}
        onClose={() => setFlagOpen(false)}
        onSaved={(id) => setFlagSavedId(id)}
        loadedScript={player.loadedScript}
        scenePos={player.scenePos}
      />
      {exportOpen && player.loadedScriptId && (
        <ExportModal
          scriptId={player.loadedScriptId}
          scriptLabel={player.loadedScript ?? player.loadedScriptId}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  );
}
