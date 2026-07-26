import type { IDevice } from '../../../types';

export interface IDeviceSelectorProps {
  devices: IDevice[];
  selectedDeviceId: string | null;
  onSelect: (id: string) => void;
}
