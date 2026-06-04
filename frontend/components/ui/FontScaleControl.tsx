'use client';

import { useEffect, useRef } from 'react';

export function FontScaleControl({ collapsed }: { collapsed?: boolean }) {
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('noctcom.fontScale');
    if (saved && selectRef.current) {
      selectRef.current.value = saved;
      document.documentElement.style.fontSize = `${parseFloat(saved) * 100}%`;
    }
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = parseFloat(e.target.value);
    document.documentElement.style.fontSize = `${value * 100}%`;
    localStorage.setItem('noctcom.fontScale', String(value));
  }

  return (
    <select
      ref={selectRef}
      defaultValue="1"
      onChange={handleChange}
      title="Tamaño de texto"
      className="h-7 px-1.5 rounded-md text-xs font-mono bg-bg-surface border border-border-faint text-text-secondary cursor-pointer focus:outline-none focus:border-violet-500/60"
    >
      <option value="0.9">A⁻</option>
      <option value="1">A</option>
      <option value="1.15">A⁺</option>
      <option value="1.3">A⁺⁺</option>
    </select>
  );
}
