'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Select from 'react-select';
import { useMessage } from '@/app/providers';
import {
  CLUB_CATEGORY_LABELS,
  MAX_CARRY_YARDS,
  MIN_CARRY_YARDS,
  MY_BAG_MAX_CLUBS,
} from '@/lib/clubs/catalogue';
import { selectStyles } from '@/lib/selectStyles';
import { SkeletonBlock } from '@/components/skeleton/Skeleton';

type ClubDefinitionDto = {
  id: string;
  key: string;
  name: string;
  shortLabel: string;
  category: keyof typeof CLUB_CATEGORY_LABELS;
  catalogueOrder: number;
  isActive: boolean;
};

type UserClubDto = {
  id: string;
  clubDefinitionId: string;
  carryYards: number;
  clubDefinition: ClubDefinitionDto;
};

type MyBagResponse = {
  clubs: UserClubDto[];
  catalogue: ClubDefinitionDto[];
  clubCount: number;
  maxClubs: number;
  message?: string;
};

type ClubOption = {
  value: string;
  label: string;
  definition: ClubDefinitionDto;
};

const CATEGORY_ORDER = [
  'WOOD',
  'HYBRID',
  'UTILITY_IRON',
  'IRON',
  'NAMED_WEDGE',
  'LOFTED_WEDGE',
] as const;

function sortClubs(clubs: UserClubDto[]) {
  return [...clubs].sort((a, b) => (
    b.carryYards - a.carryYards ||
    a.clubDefinition.catalogueOrder - b.clubDefinition.catalogueOrder
  ));
}

function formatClubCount(count: number, maxClubs: number) {
  return `${count} of ${maxClubs} clubs`;
}

function parseCarryInput(value: string) {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= MIN_CARRY_YARDS && parsed <= MAX_CARRY_YARDS ? parsed : null;
}

function normalizeCarryDraftInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 3);
  if (!digits) return '';

  const parsed = Number(digits);
  if (parsed < MIN_CARRY_YARDS) return String(MIN_CARRY_YARDS);
  if (parsed > MAX_CARRY_YARDS) return String(MAX_CARRY_YARDS);
  return String(parsed);
}

export default function MyBagPage() {
  const { status } = useSession();
  const router = useRouter();
  const { showMessage, showConfirm } = useMessage();
  const [clubs, setClubs] = useState<UserClubDto[]>([]);
  const [catalogue, setCatalogue] = useState<ClubDefinitionDto[]>([]);
  const [maxClubs, setMaxClubs] = useState(MY_BAG_MAX_CLUBS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedDefinition, setSelectedDefinition] = useState<ClubOption | null>(null);
  const [carryDraft, setCarryDraft] = useState('');
  const [editingClubId, setEditingClubId] = useState<string | null>(null);
  const [editCarryDraft, setEditCarryDraft] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login?redirect=/profile/my-bag');
    }
  }, [router, status]);

  const loadBag = useCallback(async () => {
    if (status !== 'authenticated') return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/my-bag', { cache: 'no-store' });
      const data: MyBagResponse = await response.json().catch(() => ({
        clubs: [],
        catalogue: [],
        clubCount: 0,
        maxClubs: MY_BAG_MAX_CLUBS,
      }));
      if (!response.ok) {
        throw new Error(data.message || 'Failed to load My Bag.');
      }

      setClubs(sortClubs(data.clubs));
      setCatalogue(data.catalogue);
      setMaxClubs(data.maxClubs);
    } catch (err: any) {
      setError(err.message || 'Failed to load My Bag.');
      showMessage(err.message || 'Failed to load My Bag.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showMessage, status]);

  useEffect(() => {
    loadBag();
  }, [loadBag]);

  const selectedDefinitionIds = useMemo(
    () => new Set(clubs.map((club) => club.clubDefinitionId)),
    [clubs],
  );

  const addOptions = useMemo(() => {
    return CATEGORY_ORDER
      .map((category) => ({
        label: CLUB_CATEGORY_LABELS[category],
        options: catalogue
          .filter((definition) => definition.category === category)
          .filter((definition) => definition.isActive && !selectedDefinitionIds.has(definition.id))
          .map((definition) => ({
            value: definition.id,
            label: definition.name,
            definition,
          })),
      }))
      .filter((group) => group.options.length > 0);
  }, [catalogue, selectedDefinitionIds]);

  const resetAddForm = () => {
    setSelectedDefinition(null);
    setCarryDraft('');
    setShowAddForm(false);
  };

  const refreshBag = async () => {
    const response = await fetch('/api/my-bag', { cache: 'no-store' });
    const data: MyBagResponse = await response.json().catch(() => ({
      clubs: [],
      catalogue: [],
      clubCount: 0,
      maxClubs: MY_BAG_MAX_CLUBS,
    }));
    if (!response.ok) {
      throw new Error(data.message || 'Failed to refresh My Bag.');
    }
    setClubs(sortClubs(data.clubs));
    setCatalogue(data.catalogue);
    setMaxClubs(data.maxClubs);
    return data;
  };

  const handleAddClub = async () => {
    if (!selectedDefinition) {
      showMessage('Choose a club to add.', 'error');
      return;
    }
    const carryYards = parseCarryInput(carryDraft);
    if (carryYards === null) {
      showMessage('Carry distance must be a whole number from 1 to 399 yards.', 'error');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/my-bag/clubs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clubDefinitionId: selectedDefinition.value,
          carryYards,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || 'Failed to add club.');
      }

      resetAddForm();
      const refreshed = await refreshBag();
      showMessage(refreshed.clubCount === maxClubs ? 'Bag complete.' : 'Club added to My Bag.', 'success');
    } catch (err: any) {
      showMessage(err.message || 'Failed to add club.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (club: UserClubDto) => {
    setEditingClubId(club.id);
    setEditCarryDraft(String(club.carryYards));
  };

  const handleUpdateClub = async (club: UserClubDto) => {
    const carryYards = parseCarryInput(editCarryDraft);
    if (carryYards === null) {
      showMessage('Carry distance must be a whole number from 1 to 399 yards.', 'error');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/my-bag/clubs/${club.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carryYards }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || 'Failed to update club.');
      }

      setEditingClubId(null);
      setEditCarryDraft('');
      await refreshBag();
      showMessage('Club updated.', 'success');
    } catch (err: any) {
      showMessage(err.message || 'Failed to update club.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveClub = (club: UserClubDto) => {
    showConfirm({
      title: `Remove ${club.clubDefinition.name}?`,
      message: 'This club will be removed from My Bag.',
      cancelText: 'Cancel',
      confirmText: 'Remove Club',
      variant: 'danger',
      confirmVariant: 'danger',
      onConfirm: async () => {
        setSaving(true);
        try {
          const response = await fetch(`/api/my-bag/clubs/${club.id}`, {
            method: 'DELETE',
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(data.message || 'Failed to remove club.');
          }

          setEditingClubId(null);
          await refreshBag();
          showMessage('Club removed.', 'success');
        } catch (err: any) {
          showMessage(err.message || 'Failed to remove club.', 'error');
        } finally {
          setSaving(false);
        }
      },
    });
  };

  if (status === 'unauthenticated') return null;

  const sortedClubs = sortClubs(clubs);
  const atLimit = sortedClubs.length >= maxClubs;
  const showSkeleton = status === 'loading' || loading;

  return (
    <div className="page-stack my-bag-page">
      <section className="card my-bag-header-card">
        <div className="my-bag-title-row">
          <h1>My Bag</h1>
          <span className={`my-bag-count-pill${atLimit ? ' is-complete' : ''}`}>
            {formatClubCount(sortedClubs.length, maxClubs)}
          </span>
        </div>
        <p>Carry distances for Live GPS club suggestions.</p>
      </section>

      {showSkeleton ? (
        <section className="card my-bag-list-card" aria-busy="true">
          <SkeletonBlock height={24} width="45%" />
          <SkeletonBlock height={56} />
          <SkeletonBlock height={56} />
        </section>
      ) : error ? (
        <section className="card">
          <p className="secondary-text">{error}</p>
          <button type="button" className="btn btn-secondary" onClick={loadBag}>
            Retry
          </button>
        </section>
      ) : (
        <>
          {!atLimit && !showAddForm && (
            <button type="button" className="btn btn-add" onClick={() => setShowAddForm(true)}>
              <Plus size={18} />
              Add Club
            </button>
          )}

          {showAddForm && (
            <section className="card my-bag-form-card">
              <h2>Add Club</h2>
              <label className="form-label" htmlFor="my-bag-club-definition">Club</label>
              <Select<ClubOption, false>
                inputId="my-bag-club-definition"
                value={selectedDefinition}
                onChange={(option) => setSelectedDefinition(option)}
                options={addOptions}
                isSearchable={false}
                styles={selectStyles}
                placeholder="Choose Club"
                isDisabled={saving}
              />
              <label className="form-label" htmlFor="my-bag-carry-yards">Carry Distance</label>
              <input
                id="my-bag-carry-yards"
                className="form-input"
                inputMode="numeric"
                maxLength={3}
                min={MIN_CARRY_YARDS}
                max={MAX_CARRY_YARDS}
                step={1}
                value={carryDraft}
                onChange={(event) => setCarryDraft(normalizeCarryDraftInput(event.target.value))}
                placeholder="Yards"
                disabled={saving}
              />
              <div className="form-actions">
                <button type="button" className="btn btn-cancel" onClick={resetAddForm} disabled={saving}>
                  Cancel
                </button>
                <button type="button" className="btn btn-save" onClick={handleAddClub} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Club'}
                </button>
              </div>
            </section>
          )}

          {sortedClubs.length === 0 ? (
            <section className="card my-bag-empty-card">
              <h2>No Clubs Yet</h2>
              <p>Add your clubs to get personalized suggestions during Live GPS.</p>
            </section>
          ) : (
            <section className="my-bag-list" aria-label="Configured clubs">
              {sortedClubs.map((club) => {
                const isEditing = editingClubId === club.id;
                return (
                  <article key={club.id} className="card my-bag-club-card">
                    <div className="my-bag-club-summary">
                      <div>
                        <h2>{club.clubDefinition.name}</h2>
                        {!club.clubDefinition.isActive && <span className="my-bag-inactive-note">Inactive</span>}
                      </div>
                      {isEditing ? (
                        <div className="my-bag-carry-edit">
                          <input
                            id={`carry-${club.id}`}
                            className="form-input my-bag-carry-input"
                            aria-label={`Carry yards for ${club.clubDefinition.name}`}
                            inputMode="numeric"
                            maxLength={3}
                            min={MIN_CARRY_YARDS}
                            max={MAX_CARRY_YARDS}
                            step={1}
                            value={editCarryDraft}
                            onChange={(event) => setEditCarryDraft(normalizeCarryDraftInput(event.target.value))}
                            disabled={saving}
                          />
                          <span>yd</span>
                        </div>
                      ) : (
                        <strong className="my-bag-carry-value">{club.carryYards} yd</strong>
                      )}
                      {!isEditing && (
                        <button
                          type="button"
                          className="my-bag-icon-btn"
                          onClick={() => startEdit(club)}
                          aria-label={`Edit ${club.clubDefinition.name}`}
                          title="Edit Club"
                        >
                          <Pencil size={16} />
                        </button>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="my-bag-edit-panel">
                        <div className="form-actions my-bag-edit-actions">
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => setEditingClubId(null)}
                            disabled={saving}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="btn btn-save"
                            onClick={() => handleUpdateClub(club)}
                          disabled={saving}
                        >
                            {saving ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                      <button
                        type="button"
                          className="btn btn-cancel my-bag-remove-btn"
                        onClick={() => handleRemoveClub(club)}
                        disabled={saving}
                      >
                          <Trash2 size={18} />
                          Remove Club
                        </button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </section>
          )}
        </>
      )}
    </div>
  );
}
