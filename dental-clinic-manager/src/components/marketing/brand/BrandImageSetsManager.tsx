'use client';
import { useRef, useState } from 'react';
import { useBrandImageSets } from '@/hooks/useBrandImageSets';
import type { BrandImageSetCard, BrandImageSetWithCards } from '@/types/brand';

interface Props {
  canManage: boolean;
}

export function BrandImageSetsManager({ canManage }: Props) {
  const { sets, loading, createSet, updateSet, deleteSet, addCard, updateCard, deleteCard } = useBrandImageSets();
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyMsg, setBusyMsg] = useState<string>('');

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await createSet(name);
      setNewName('');
    } catch (e) {
      alert(e instanceof Error ? e.message : '세트 생성 실패');
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <p className="text-sm text-at-text-weak">불러오는 중…</p>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-at-text-secondary leading-relaxed">
        AI 글의 끝부분에 자동 첨가할 이미지 카드를 묶어 두는 공간입니다. 같은 세트의 카드는 LRU 순환으로
        매번 다른 카드가 사용되며, 발행 시점에 sharp 로 미세 변형(크롭·색조·텍스트 오버레이)을 적용해
        네이버 유사이미지 판독을 회피합니다.
      </p>

      {canManage && (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-at-text-secondary mb-1">새 세트 이름</label>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="예: 병원 소개, 진료시간, 오시는 길"
              className="w-full px-3 py-2 border border-at-border rounded text-sm"
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
            />
          </div>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className="px-3 py-2 bg-at-accent text-white text-sm rounded disabled:bg-gray-300"
          >
            세트 추가
          </button>
        </div>
      )}

      {busyMsg && <p className="text-xs text-at-text-secondary">{busyMsg}</p>}

      {sets.length === 0 ? (
        <p className="text-sm text-at-text-weak">아직 세트가 없습니다 — 위에서 첫 세트를 만들어보세요.</p>
      ) : (
        <ul className="space-y-3">
          {sets.map(set => (
            <SetCard
              key={set.id}
              set={set}
              canManage={canManage}
              onRename={(name) => updateSet(set.id, { name })}
              onDelete={async () => {
                if (!confirm(`'${set.name}' 세트와 카드 ${set.cards.length}개를 모두 삭제할까요?`)) return;
                try { await deleteSet(set.id); } catch (e) { alert(e instanceof Error ? e.message : '삭제 실패'); }
              }}
              onAddCard={async (file, t, s) => {
                setBusyMsg(`${set.name}: 카드 업로드 중...`);
                try { await addCard(set.id, file, t, s); } finally { setBusyMsg(''); }
              }}
              onUpdateCard={(cardId, update) => updateCard(set.id, cardId, update)}
              onDeleteCard={(cardId) => deleteCard(set.id, cardId)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface SetCardProps {
  set: BrandImageSetWithCards;
  canManage: boolean;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onAddCard: (file: File, titleCopy?: string, subtitleCopy?: string) => Promise<void>;
  onUpdateCard: (cardId: string, update: { title_copy?: string | null; subtitle_copy?: string | null }) => Promise<void>;
  onDeleteCard: (cardId: string) => Promise<void>;
}

function SetCard({ set, canManage, onRename, onDelete, onAddCard, onUpdateCard, onDeleteCard }: SetCardProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(set.name);
  const [cardTitleCopy, setCardTitleCopy] = useState('');
  const [cardSubtitleCopy, setCardSubtitleCopy] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const handleFile = async (file: File) => {
    try {
      await onAddCard(file, cardTitleCopy || undefined, cardSubtitleCopy || undefined);
      setCardTitleCopy('');
      setCardSubtitleCopy('');
    } catch (e) {
      alert(e instanceof Error ? e.message : '업로드 실패');
    }
  };

  return (
    <li className="border border-at-border rounded-lg p-3 bg-white">
      <header className="flex items-center justify-between gap-2 mb-3">
        {editingName ? (
          <div className="flex items-center gap-1 flex-1">
            <input
              type="text"
              value={nameDraft}
              onChange={e => setNameDraft(e.target.value)}
              className="flex-1 px-2 py-1 border border-at-border rounded text-sm"
            />
            <button
              type="button"
              onClick={async () => {
                const n = nameDraft.trim();
                if (n) await onRename(n);
                setEditingName(false);
              }}
              className="px-2 py-1 text-xs bg-at-accent text-white rounded"
            >저장</button>
            <button
              type="button"
              onClick={() => { setNameDraft(set.name); setEditingName(false); }}
              className="px-2 py-1 text-xs text-at-text-secondary border border-at-border rounded"
            >취소</button>
          </div>
        ) : (
          <h3 className="text-sm font-semibold text-at-text flex-1">
            {set.name}
            <span className="ml-2 text-xs text-at-text-secondary">({set.cards.length}장)</span>
          </h3>
        )}
        {canManage && !editingName && (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className="text-xs text-at-text-secondary hover:text-at-text"
            >이름 수정</button>
            <button
              type="button"
              onClick={onDelete}
              className="text-xs text-red-600 hover:text-red-700"
            >세트 삭제</button>
          </div>
        )}
      </header>

      {set.cards.length > 0 && (
        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-3">
          {set.cards.map(card => (
            <CardItem
              key={card.id}
              card={card}
              canManage={canManage}
              onUpdate={(update) => onUpdateCard(card.id, update)}
              onDelete={async () => {
                if (!confirm('이 카드를 삭제할까요?')) return;
                try { await onDeleteCard(card.id); } catch (e) { alert(e instanceof Error ? e.message : '삭제 실패'); }
              }}
            />
          ))}
        </ul>
      )}

      {canManage && (
        <div className="border-t border-at-border pt-3 space-y-2">
          <p className="text-xs font-medium text-at-text-secondary">카드 추가</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              value={cardTitleCopy}
              onChange={e => setCardTitleCopy(e.target.value)}
              placeholder="상단 카피 (선택) — 예: 진료시간 안내"
              className="px-2 py-1.5 border border-at-border rounded text-xs"
            />
            <input
              type="text"
              value={cardSubtitleCopy}
              onChange={e => setCardSubtitleCopy(e.target.value)}
              placeholder="하단 카피 (선택) — 예: 평일 10:00~19:00"
              className="px-2 py-1.5 border border-at-border rounded text-xs"
            />
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              if (fileRef.current) fileRef.current.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full px-3 py-2 border-2 border-dashed border-at-border rounded text-xs text-at-text-secondary hover:bg-at-surface-alt"
          >
            이미지 파일 선택 (10MB 이하)
          </button>
        </div>
      )}
    </li>
  );
}

interface CardItemProps {
  card: BrandImageSetCard;
  canManage: boolean;
  onUpdate: (update: { title_copy?: string | null; subtitle_copy?: string | null }) => Promise<void>;
  onDelete: () => Promise<void>;
}

function CardItem({ card, canManage, onUpdate, onDelete }: CardItemProps) {
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(card.title_copy || '');
  const [subtitleDraft, setSubtitleDraft] = useState(card.subtitle_copy || '');

  return (
    <li className="border border-at-border rounded overflow-hidden bg-at-surface-alt/40">
      <div className="aspect-video bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={card.image_url} alt={card.title_copy || ''} className="w-full h-full object-cover" />
      </div>
      <div className="p-2 space-y-1.5">
        {editing ? (
          <>
            <input
              type="text"
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              placeholder="상단 카피"
              className="w-full px-1.5 py-1 border border-at-border rounded text-xs"
            />
            <input
              type="text"
              value={subtitleDraft}
              onChange={e => setSubtitleDraft(e.target.value)}
              placeholder="하단 카피"
              className="w-full px-1.5 py-1 border border-at-border rounded text-xs"
            />
            <div className="flex gap-1">
              <button
                type="button"
                onClick={async () => {
                  await onUpdate({ title_copy: titleDraft || null, subtitle_copy: subtitleDraft || null });
                  setEditing(false);
                }}
                className="flex-1 px-2 py-1 bg-at-accent text-white text-xs rounded"
              >저장</button>
              <button
                type="button"
                onClick={() => { setTitleDraft(card.title_copy || ''); setSubtitleDraft(card.subtitle_copy || ''); setEditing(false); }}
                className="px-2 py-1 border border-at-border text-xs rounded"
              >취소</button>
            </div>
          </>
        ) : (
          <>
            {card.title_copy && <p className="text-xs font-semibold text-at-text leading-tight">{card.title_copy}</p>}
            {card.subtitle_copy && <p className="text-[11px] text-at-text-secondary leading-tight">{card.subtitle_copy}</p>}
            <p className="text-[10px] text-at-text-weak">사용 {card.use_count}회{card.last_used_at && ` · 마지막 ${new Date(card.last_used_at).toLocaleDateString('ko-KR')}`}</p>
            {canManage && (
              <div className="flex gap-1 pt-1">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="flex-1 px-1.5 py-0.5 border border-at-border text-[11px] rounded"
                >카피 수정</button>
                <button
                  type="button"
                  onClick={onDelete}
                  className="px-1.5 py-0.5 border border-red-300 text-red-600 text-[11px] rounded"
                >삭제</button>
              </div>
            )}
          </>
        )}
      </div>
    </li>
  );
}
