import { render, screen, fireEvent } from '@testing-library/react';
import { TableList } from '../index';

describe('TableList', () => {
  it('renders every table name', () => {
    render(<TableList tables={['users', 'orders']} currentTable={null} onSelect={vi.fn()} onManage={vi.fn()} />);

    expect(screen.getByText('users')).toBeInTheDocument();
    expect(screen.getByText('orders')).toBeInTheDocument();
  });

  it('shows an empty message when there are no tables', () => {
    render(<TableList tables={[]} currentTable={null} onSelect={vi.fn()} onManage={vi.fn()} />);

    expect(screen.getByText('No tables yet.')).toBeInTheDocument();
  });

  it('calls onSelect with the clicked table name', () => {
    const onSelect = vi.fn();
    render(<TableList tables={['users', 'orders']} currentTable={null} onSelect={onSelect} onManage={vi.fn()} />);

    fireEvent.click(screen.getByText('orders'));

    expect(onSelect).toHaveBeenCalledWith('orders');
  });

  it('groups tables prefixed with an underscore under a collapsed System section', () => {
    render(
      <TableList
        tables={['users', '_salve_relations', '_sync_apply_lock']}
        currentTable={null}
        onSelect={vi.fn()}
        onManage={vi.fn()}
      />
    );

    expect(screen.getByText('users')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'System (2)' })).toBeInTheDocument();
    expect(screen.queryByText('_salve_relations')).not.toBeInTheDocument();
    expect(screen.queryByText('_sync_apply_lock')).not.toBeInTheDocument();
  });

  it('reveals system tables when the System section is toggled', () => {
    render(
      <TableList tables={['users', '_salve_relations']} currentTable={null} onSelect={vi.fn()} onManage={vi.fn()} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'System (1)' }));

    expect(screen.getByText('_salve_relations')).toBeInTheDocument();
  });

  it('auto-expands the System section when a system table is selected', () => {
    render(
      <TableList
        tables={['users', '_salve_relations']}
        currentTable="_salve_relations"
        onSelect={vi.fn()}
        onManage={vi.fn()}
      />
    );

    expect(screen.getByText('_salve_relations')).toBeInTheDocument();
  });

  it('calls onManage with the table name, without triggering onSelect', () => {
    const onSelect = vi.fn();
    const onManage = vi.fn();
    render(<TableList tables={['users']} currentTable={null} onSelect={onSelect} onManage={onManage} />);

    fireEvent.click(screen.getByRole('button', { name: 'Manage users' }));

    expect(onManage).toHaveBeenCalledWith('users');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('filters user tables by the search query, case-insensitively', () => {
    render(
      <TableList tables={['users', 'orders', 'benchmark_rows']} currentTable={null} onSelect={vi.fn()} onManage={vi.fn()} />
    );

    fireEvent.change(screen.getByPlaceholderText('Search tables…'), { target: { value: 'ORDE' } });

    expect(screen.getByText('orders')).toBeInTheDocument();
    expect(screen.queryByText('users')).not.toBeInTheDocument();
    expect(screen.queryByText('benchmark_rows')).not.toBeInTheDocument();
  });

  it('filters system tables too and auto-expands the System section on a match', () => {
    render(
      <TableList
        tables={['users', '_salve_relations', '_sync_apply_lock']}
        currentTable={null}
        onSelect={vi.fn()}
        onManage={vi.fn()}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('Search tables…'), { target: { value: 'relations' } });

    expect(screen.getByText('_salve_relations')).toBeInTheDocument();
    expect(screen.queryByText('_sync_apply_lock')).not.toBeInTheDocument();
    expect(screen.queryByText('users')).not.toBeInTheDocument();
  });

  it('shows a no-matches message when the query matches nothing', () => {
    render(<TableList tables={['users', 'orders']} currentTable={null} onSelect={vi.fn()} onManage={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Search tables…'), { target: { value: 'zzz' } });

    expect(screen.getByText('No tables match "zzz".')).toBeInTheDocument();
  });
});
