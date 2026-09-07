import { Workbench } from '@/components/studio/workbench';
import { LocaleProvider } from '@/components/studio/locale';
export default function Page() {
  return (
    <LocaleProvider>
      <Workbench />
    </LocaleProvider>
  );
}
