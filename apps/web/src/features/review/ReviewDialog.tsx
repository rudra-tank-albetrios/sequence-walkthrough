import * as Tabs from '@radix-ui/react-tabs';

import { useFlowStore } from '../../shared/state/flowStore.ts';
import { Dialog } from '../../shared/ui/Dialog.tsx';
import styles from './review.module.css';
import { ReviewPanel, ThreatsPanel } from './ReviewPanels.tsx';

/** The two panels in one dialog, until they become tools of the Analyze group. */
export function ReviewDialog() {
  const threatsOpen = useFlowStore((s) => s.ui.threatsOpen);
  const threats = useFlowStore((s) => s.flow?.threats.length ?? 0);
  const setUi = useFlowStore((s) => s.setUi);
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) setUi({ reviewOpen: false, threatsOpen: false });
      }}
      title="Structure review"
      description="A rating of how well this flow follows its layers, how much evidence supports it, and the possible problems noted on its steps."
      size="wide"
    >
      <Tabs.Root defaultValue={threatsOpen ? 'threats' : 'structure'}>
        <Tabs.List className={styles.tabs} aria-label="Review">
          <Tabs.Trigger className={styles.tab} value="structure">
            Structure
          </Tabs.Trigger>
          <Tabs.Trigger className={styles.tab} value="threats">
            Threats ({threats})
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content className={styles.panel} value="structure">
          <ReviewPanel />
        </Tabs.Content>
        <Tabs.Content className={styles.panel} value="threats">
          <ThreatsPanel />
        </Tabs.Content>
      </Tabs.Root>
    </Dialog>
  );
}
