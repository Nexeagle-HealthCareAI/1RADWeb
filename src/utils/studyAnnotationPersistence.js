// Saved viewer measurements (gap analysis P3-7).
//
// The viewer's Cornerstone annotations (lengths, angles, ROIs, arrows…) used to vanish
// on reload. This hook loads a study's saved set from GET /study-annotations and saves
// it back (debounced) on every add / edit / delete.
//
// Image IDs change between sessions (blob: URLs, signed CDN URLs), so each saved
// annotation is tagged with its slice's SOP Instance UID and re-attached by SOP; when
// the SOP isn't known it falls back to the slice index if the stack length matches.
// One shared in-memory copy per study key, so several viewers of the same study
// (2×2 layout, different series) merge instead of overwriting each other.
import { useEffect, useRef } from 'react';
import apiClient from '../api/apiClient';

const store = new Map(); // key -> { items: [], loaded: Promise }
const SAVE_DELAY_MS = 1500;

function entryFor(key) {
  if (!store.has(key)) {
    const entry = { items: [], loaded: null };
    entry.loaded = apiClient
      .get('/study-annotations', { params: { key }, suppressErrorToast: true })
      .then(res => { entry.items = Array.isArray(res?.data?.data?.annotations) ? res.data.data.annotations : []; })
      .catch(err => { console.warn('[annotations] load failed', err?.message || err); entry.items = []; });
    store.set(key, entry);
  }
  return store.get(key);
}

const clone = (o) => JSON.parse(JSON.stringify(o ?? null));

export function useStudyAnnotationPersistence({
  annotationKey, isReady, files, elementRef, renderingEngineRef, viewportId,
  annotationApi, eventTarget, events, metaData,
}) {
  const restoringRef = useRef(false);
  const timerRef = useRef(null);
  const lastIdsRef = useRef([]); // stack seen at the last edit, for the unmount flush
  const filesRef = useRef(files);
  filesRef.current = files;

  const imageIds = () => {
    try { return renderingEngineRef.current?.getViewport(viewportId)?.getImageIds?.() || []; } catch { return []; }
  };
  const sopAt = (ids, index) => {
    const f = filesRef.current?.[index];
    if (f && f.sopInstanceUID) return f.sopInstanceUID;
    try { return metaData?.get('sopCommonModule', ids[index])?.sopInstanceUID || null; } catch { return null; }
  };

  // Load + restore whenever the study or the stack changes.
  useEffect(() => {
    if (!annotationKey || !isReady || !annotationApi) return undefined;
    let cancelled = false;
    const entry = entryFor(annotationKey);
    entry.loaded.then(() => {
      if (cancelled) return;
      const ids = imageIds();
      if (ids.length === 0 || !elementRef.current) return;
      const sopToIndex = new Map();
      ids.forEach((_, i) => { const s = sopAt(ids, i); if (s) sopToIndex.set(s, i); });
      restoringRef.current = true;
      let added = 0;
      try {
        for (const item of entry.items) {
          let idx = item.sop ? sopToIndex.get(item.sop) : undefined;
          if (idx === undefined && item.stackLength === ids.length && Number.isInteger(item.index)) idx = item.index;
          if (idx === undefined || !item.uid) continue;
          if (annotationApi.state.getAnnotation(item.uid)) continue;
          annotationApi.state.addAnnotation({
            annotationUID: item.uid,
            highlighted: false,
            invalidated: true,
            isLocked: false,
            isVisible: true,
            metadata: { ...(item.metadata || {}), toolName: item.toolName, referencedImageId: ids[idx] },
            data: { ...(item.data || {}), cachedStats: {} },
          }, elementRef.current);
          added++;
        }
        if (added > 0) renderingEngineRef.current?.renderViewports([viewportId]);
      } catch (e) {
        console.warn('[annotations] restore failed', e);
      } finally {
        restoringRef.current = false;
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotationKey, isReady, files]);

  // Save on add / edit / delete (debounced).
  useEffect(() => {
    if (!annotationKey || !isReady || !annotationApi || !eventTarget || !events) return undefined;

    const save = async () => {
      timerRef.current = null;
      const entry = entryFor(annotationKey);
      await entry.loaded;
      const live = imageIds();
      const ids = live.length ? live : lastIdsRef.current; // engine may be gone on unmount
      if (ids.length === 0) return;
      const idIndex = new Map(ids.map((id, i) => [id, i]));
      const current = [];
      for (const a of annotationApi.state.getAllAnnotations() || []) {
        const idx = idIndex.get(a?.metadata?.referencedImageId);
        if (idx === undefined) continue;
        const metadata = clone(a.metadata) || {};
        delete metadata.referencedImageId;
        const data = clone(a.data) || {};
        delete data.cachedStats;
        current.push({
          uid: a.annotationUID,
          toolName: a.metadata?.toolName,
          sop: sopAt(ids, idx),
          index: idx,
          stackLength: ids.length,
          metadata,
          data,
          savedAt: new Date().toISOString(),
        });
      }
      const currentSops = new Set(ids.map((_, i) => sopAt(ids, i)).filter(Boolean));
      const others = entry.items.filter(s => (s.sop ? !currentSops.has(s.sop) : s.stackLength !== ids.length));
      const next = [...others, ...current];
      entry.items = next;
      try {
        await apiClient.put('/study-annotations', { key: annotationKey, annotations: next }, { suppressErrorToast: true });
      } catch (err) {
        console.warn('[annotations] save failed', err?.response?.status || err?.message || err);
      }
    };

    const onChange = () => {
      if (restoringRef.current) return;
      const ids = imageIds();
      if (ids.length) lastIdsRef.current = ids;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(save, SAVE_DELAY_MS);
    };
    const names = [events.ANNOTATION_COMPLETED, events.ANNOTATION_MODIFIED, events.ANNOTATION_REMOVED].filter(Boolean);
    names.forEach(n => eventTarget.addEventListener(n, onChange));
    return () => {
      names.forEach(n => eventTarget.removeEventListener(n, onChange));
      if (timerRef.current) { clearTimeout(timerRef.current); save(); } // flush on unmount
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotationKey, isReady]);
}
