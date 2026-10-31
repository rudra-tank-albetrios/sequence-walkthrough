import { Select } from '../../shared/ui/Select.tsx';
import { setActiveModel, useAiStore } from './aiStore.ts';

/** Which model is asked first. Nothing is shown before a model is saved. */
export function ModelPicker() {
  const models = useAiStore((s) => s.state.models);
  const activeId = useAiStore((s) => s.state.activeId);
  if (!models.length) return null;
  return (
    <Select
      aria-label="Model to ask first"
      value={activeId}
      onChange={(e) => {
        setActiveModel(e.target.value);
      }}
    >
      {models.map((model) => (
        <option key={model.id} value={model.id}>
          {model.name}
        </option>
      ))}
    </Select>
  );
}
