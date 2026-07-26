import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DeviceSelector } from '../index';

const devices = [
  { id: 'ios-1', platform: 'ios', dbName: 'main' },
  { id: 'android-1', platform: 'android', dbName: 'main-android' },
];

describe('DeviceSelector', () => {
  it('renders nothing when there are no devices', () => {
    const { container } = render(
      <DeviceSelector devices={[]} selectedDeviceId={null} onSelect={vi.fn()} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the selected device on the trigger button, with no dropdown chevron for a single device', () => {
    render(
      <DeviceSelector
        devices={[devices[0]!]}
        selectedDeviceId="ios-1"
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Select device' })).toHaveTextContent('main');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('opens a listbox with every device when the trigger is clicked', () => {
    render(<DeviceSelector devices={devices} selectedDeviceId="ios-1" onSelect={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Select device' }));

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /main-android/ })).toBeInTheDocument();
  });

  it('marks the currently selected device as aria-selected', () => {
    render(<DeviceSelector devices={devices} selectedDeviceId="android-1" onSelect={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Select device' }));

    expect(screen.getByRole('option', { name: /main-android/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: /^main$/ })).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onSelect and closes the list when a device is picked', async () => {
    const onSelect = vi.fn();
    render(<DeviceSelector devices={devices} selectedDeviceId="ios-1" onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button', { name: 'Select device' }));
    fireEvent.click(screen.getByRole('option', { name: /main-android/ }));

    expect(onSelect).toHaveBeenCalledWith('android-1');
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });
});
