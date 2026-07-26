import { render, screen, fireEvent } from '@testing-library/react';
import { TableList } from '../index';

describe('TableList', () => {
  it('renders every table name', () => {
    render(<TableList tables={['users', 'orders']} currentTable={null} onSelect={vi.fn()} />);

    expect(screen.getByText('users')).toBeInTheDocument();
    expect(screen.getByText('orders')).toBeInTheDocument();
  });

  it('shows an empty message when there are no tables', () => {
    render(<TableList tables={[]} currentTable={null} onSelect={vi.fn()} />);

    expect(screen.getByText('No tables yet.')).toBeInTheDocument();
  });

  it('calls onSelect with the clicked table name', () => {
    const onSelect = vi.fn();
    render(<TableList tables={['users', 'orders']} currentTable={null} onSelect={onSelect} />);

    fireEvent.click(screen.getByText('orders'));

    expect(onSelect).toHaveBeenCalledWith('orders');
  });
});
