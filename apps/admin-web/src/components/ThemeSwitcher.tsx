import type { ReactElement } from 'react';
import { Sun, Moon } from './Icons';
import { useTheme } from '../context/ThemeContext';

export function ThemeSwitcher(): ReactElement {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="theme-toggle-container" role="radiogroup" aria-label="Theme switcher">
      <button
        type="button"
        className={`theme-toggle-btn ${theme === 'light' ? 'is-active' : ''}`}
        onClick={() => {
          if (theme !== 'light') toggleTheme();
        }}
        title="Switch to Light Theme"
        aria-label="Light Theme"
        aria-checked={theme === 'light'}
        role="radio"
      >
        <Sun size={15} className="theme-btn-icon sun-icon" />
        <span className="theme-btn-label">Light</span>
      </button>

      <button
        type="button"
        className={`theme-toggle-btn ${theme === 'dark' ? 'is-active' : ''}`}
        onClick={() => {
          if (theme !== 'dark') toggleTheme();
        }}
        title="Switch to Dark Theme"
        aria-label="Dark Theme"
        aria-checked={theme === 'dark'}
        role="radio"
      >
        <Moon size={15} className="theme-btn-icon moon-icon" />
        <span className="theme-btn-label">Dark</span>
      </button>

      <div className={`theme-toggle-slider ${theme}`} />
    </div>
  );
}
