'use client';

import { useState } from 'react';

interface ManualCourseFormProps {
  onCourseCreated: (courseData: any) => void;
  onCancel: () => void;
}

export default function ManualCourseForm({ onCourseCreated, onCancel }: ManualCourseFormProps) {
  const [courseInfo, setCourseInfo] = useState({
    course_name: '',
    club_name: '',
    city: '',
    state: '',
    country: '',
    address: '',
  });

  const [tees, setTees] = useState<any[]>([]);
  const [currentTee, setCurrentTee] = useState({
    gender: 'male' as 'male' | 'female',
    tee_name: '',
    course_rating: '',
    slope_rating: '',
    number_of_holes: '18',
    par_total: '',
  });

  const [holes, setHoles] = useState<any[]>([]);

  const handleCourseInfoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCourseInfo({ ...courseInfo, [e.target.name]: e.target.value });
  };

  const handleTeeChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setCurrentTee({ ...currentTee, [e.target.name]: e.target.value });
  };

  const initializeHoles = () => {
    const numHoles = parseInt(currentTee.number_of_holes);
    const newHoles = Array.from({ length: numHoles }, (_, i) => ({
      hole_number: i + 1,
      par: 4,
      yardage: 0,
      handicap: i + 1,
    }));
    setHoles(newHoles);
  };

  const updateHole = (index: number, field: string, value: string) => {
    const updatedHoles = [...holes];
    updatedHoles[index] = { ...updatedHoles[index], [field]: parseInt(value) || 0 };
    setHoles(updatedHoles);
  };

  const addTee = () => {
    if (!currentTee.tee_name || !currentTee.course_rating || !currentTee.slope_rating || holes.length === 0) {
      alert('Please fill in all tee information and hole data');
      return;
    }

    const totalYards = holes.reduce((sum, hole) => sum + (hole.yardage || 0), 0);
    const calculatedPar = holes.reduce((sum, hole) => sum + (hole.par || 0), 0);

    const newTee = {
      tee_name: currentTee.tee_name,
      course_rating: parseFloat(currentTee.course_rating),
      slope_rating: parseInt(currentTee.slope_rating),
      total_yards: totalYards,
      number_of_holes: parseInt(currentTee.number_of_holes),
      par_total: calculatedPar,
      gender: currentTee.gender,
      holes: [...holes],
    };

    setTees([...tees, newTee]);
    setCurrentTee({
      gender: 'male',
      tee_name: '',
      course_rating: '',
      slope_rating: '',
      number_of_holes: '18',
      par_total: '',
    });
    setHoles([]);
  };

  const removeTee = (index: number) => {
    setTees(tees.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (!courseInfo.course_name || !courseInfo.club_name || tees.length === 0) {
      alert('Please fill in course name, club name, and add at least one tee');
      return;
    }

    const maleTees = tees.filter(t => t.gender === 'male');
    const femaleTees = tees.filter(t => t.gender === 'female');

    const courseData = {
      id: Date.now(), // Temporary ID
      course_name: courseInfo.course_name,
      club_name: courseInfo.club_name,
      location: {
        city: courseInfo.city || undefined,
        state: courseInfo.state || undefined,
        country: courseInfo.country || undefined,
        address: courseInfo.address || undefined,
      },
      tees: {
        male: maleTees.map(({ gender, ...rest }) => rest),
        female: femaleTees.map(({ gender, ...rest }) => rest),
      },
    };

    onCourseCreated(courseData);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Course Information */}
      <div>
        <h3>Course Information</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
          <div>
            <label className="form-label">Course Name *</label>
            <input
              name="course_name"
              value={courseInfo.course_name}
              onChange={handleCourseInfoChange}
              className="form-input"
              placeholder="e.g., Championship Course"
              required
              max={250}
            />
          </div>
          <div>
            <label className="form-label">Club Name *</label>
            <input
              name="club_name"
              value={courseInfo.club_name}
              onChange={handleCourseInfoChange}
              className="form-input"
              placeholder="e.g., Pine Valley Golf Club"
              required
              max={250}
            />
          </div>
          <div>
            <label className="form-label">City</label>
            <input
              name="city"
              value={courseInfo.city}
              onChange={handleCourseInfoChange}
              className="form-input"
              placeholder="e.g., Winnipeg"
              max={100}
            />
          </div>
          <div>
            <label className="form-label">State/Province</label>
            <input
              name="state"
              value={courseInfo.state}
              onChange={handleCourseInfoChange}
              className="form-input"
              placeholder="e.g., MB"
              max={50}
            />
          </div>
          <div>
            <label className="form-label">Country</label>
            <input
              name="country"
              value={courseInfo.country}
              onChange={handleCourseInfoChange}
              className="form-input"
              placeholder="e.g., Canada"
              max={50}
            />
          </div>
          <div>
            <label className="form-label">Address</label>
            <input
              name="address"
              value={courseInfo.address}
              onChange={handleCourseInfoChange}
              className="form-input"
              placeholder="e.g., 123 Golf Rd"
              max={100}
            />
          </div>
        </div>
      </div>

      {/* Tee Builder */}
      <div style={{ padding: '10px', borderRadius: '8px', background: '#1E242F' }}>
        <h3>Add Tee Box</h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
          <div>
            <label className="form-label">Gender *</label>
            <select
              name="gender"
              value={currentTee.gender}
              onChange={handleTeeChange}
              className="form-input"
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
          <div>
            <label className="form-label">Tee Name *</label>
            <input
              name="tee_name"
              value={currentTee.tee_name}
              onChange={handleTeeChange}
              className="form-input"
              placeholder="e.g., Blue, White, Red"
              max={50}
            />
          </div>
          <div>
            <label className="form-label">Number of Holes *</label>
            <select
              name="number_of_holes"
              value={currentTee.number_of_holes}
              onChange={handleTeeChange}
              className="form-input"
            >
              <option value="9">9 Holes</option>
              <option value="18">18 Holes</option>
            </select>
          </div>
          <div>
            <label className="form-label">Course Rating *</label>
            <input
              type="number"
              step="0.1"
              name="course_rating"
              value={currentTee.course_rating}
              onChange={handleTeeChange}
              className="form-input"
              placeholder="e.g., 72.5"
              max={99}
            />
          </div>
          <div>
            <label className="form-label">Slope Rating *</label>
            <input
              type="number"
              name="slope_rating"
              value={currentTee.slope_rating}
              onChange={handleTeeChange}
              className="form-input"
              placeholder="e.g., 135"
              max={250}
            />
          </div>
        </div>

        {holes.length === 0 ? (
          <button
            type="button"
            onClick={initializeHoles}
            className="btn btn-toggle"
            disabled={!currentTee.number_of_holes}
          >
            Initialize {currentTee.number_of_holes} Holes
          </button>
        ) : (
          <>
            <h4>Hole Details</h4>
            <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '10px' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Hole</th>
                    <th>Par</th>
                    <th>Yardage</th>
                    <th>Handicap</th>
                  </tr>
                </thead>
                <tbody>
                  {holes.map((hole, idx) => (
                    <tr key={idx}>
                      <td>{hole.hole_number}</td>
                      <td>
                        <input
                          type="number"
                          min="3"
                          max="6"
                          value={hole.par}
                          onChange={(e) => updateHole(idx, 'par', e.target.value)}
                          style={{ width: '60px', textAlign: 'center' }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={hole.yardage}
                          onChange={(e) => updateHole(idx, 'yardage', e.target.value)}
                          style={{ width: '80px', textAlign: 'center' }}
                          max={999}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="1"
                          max="18"
                          value={hole.handicap}
                          onChange={(e) => updateHole(idx, 'handicap', e.target.value)}
                          style={{ width: '60px', textAlign: 'center' }}
                        />
                      </td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 'bold', backgroundColor: '#f0f0f0' }}>
                    <td>Total</td>
                    <td>{holes.reduce((sum, hole) => sum + (hole.par || 0), 0)}</td>
                    <td>{holes.reduce((sum, hole) => sum + (hole.yardage || 0), 0)}</td>
                    <td>-</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setHoles([])}
                className="btn btn-cancel"
              >
                Reset Holes
              </button>
              <button
                type="button"
                onClick={addTee}
                className="btn btn-save"
              >
                Add This Tee to Course
              </button>
            </div>
          </>
        )}
      </div>

      {/* Added Tees List */}
      {tees.length > 0 && (
        <div>
          <h3 style={{ marginBottom: '10px' }}>Added Tees ({tees.length})</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {tees.map((tee, idx) => (
              <div
                key={idx}
                style={{
                  padding: '10px',
                  background: tee.gender === 'male' ? '#e3f2fd' : '#fce4ec',
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <strong>{tee.tee_name}</strong> ({tee.gender}) - {tee.total_yards} yds,
                  Par {tee.par_total}, Rating: {tee.course_rating}, Slope: {tee.slope_rating}
                  <div style={{ fontSize: '0.85rem', color: '#666' }}>
                    {tee.number_of_holes} holes
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeTee(idx)}
                  className="btn btn-cancel"
                  style={{ width: 'auto', padding: '10px' }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-cancel"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          className="btn btn-save"
          disabled={tees.length === 0}
        >
          Create Course Preview
        </button>
      </div>
    </div>
  );
}
