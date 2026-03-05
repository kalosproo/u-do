import { useCallback, useEffect, useMemo, useState } from "react";
import { auth } from "../services/firebase";
import { completeHabit, createHabit, getHabits } from "../services/habits";

function Habits() {
  const user = auth.currentUser;
  const [habits, setHabits] = useState([]);
  const [habitName, setHabitName] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [completingHabitId, setCompletingHabitId] = useState("");
  const [error, setError] = useState("");

  const refreshHabits = useCallback(async () => {
    if (!user) {
      setHabits([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const fetchedHabits = await getHabits(user.uid);
      setHabits(fetchedHabits);
    } catch (fetchError) {
      setError(fetchError.message || "Unable to load habits.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refreshHabits();
  }, [refreshHabits]);

  const handleCreateHabit = async () => {
    if (!user) return;

    setCreating(true);
    setError("");
    try {
      await createHabit({ userId: user.uid, name: habitName });
      setHabitName("");
      await refreshHabits();
    } catch (createError) {
      setError(createError.message || "Unable to create habit.");
    } finally {
      setCreating(false);
    }
  };

  const handleCompleteHabit = async (habitId) => {
    if (!user) return;

    setCompletingHabitId(habitId);
    setError("");

    try {
      const updatedHabit = await completeHabit({ userId: user.uid, habitId });
      setHabits((currentHabits) =>
        currentHabits.map((habit) => (habit.id === habitId ? { ...habit, ...updatedHabit } : habit))
      );
    } catch (completeError) {
      setError(completeError.message || "Unable to complete habit.");
    } finally {
      setCompletingHabitId("");
    }
  };

  const totalCompletions = useMemo(
    () => habits.reduce((count, habit) => count + habit.completedDates.length, 0),
    [habits]
  );

  return (
    <section className="habits-page">
      <header className="habits-simple-header">
        <h2>Habit Streaks</h2>
        <p>Build momentum one day at a time.</p>
      </header>

      <div className="habits-simple-create">
        <input
          type="text"
          value={habitName}
          placeholder="Habit name"
          onChange={(event) => setHabitName(event.target.value)}
          disabled={creating}
        />
        <button onClick={handleCreateHabit} disabled={creating}>
          {creating ? "Creating..." : "Create Habit"}
        </button>
      </div>

      {error && <p className="login-error">{error}</p>}

      <div className="habits-simple-stats">
        <span>{habits.length} habits</span>
        <span>{totalCompletions} total completions</span>
      </div>

      {loading ? (
        <p>Loading habits...</p>
      ) : (
        <div className="habit-cards">
          {habits.map((habit) => (
            <article key={habit.id} className="habit-card">
              <h3>{habit.name}</h3>
              <p>🔥 {habit.streak} day streak</p>
              <p>🏆 best: {habit.longestStreak} days</p>
              <button
                onClick={() => handleCompleteHabit(habit.id)}
                disabled={completingHabitId === habit.id}
              >
                {completingHabitId === habit.id ? "Saving..." : "Complete Today"}
              </button>
            </article>
          ))}

          {!habits.length && <p>No habits yet. Create your first one.</p>}
        </div>
      )}
    </section>
  );
}

export default Habits;
