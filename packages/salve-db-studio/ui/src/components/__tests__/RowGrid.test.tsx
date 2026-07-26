import { render, screen, fireEvent } from '@testing-library/react';
import { RowGrid } from '../RowGrid';
import type { IColumnInfo } from '../../types';

const columns: IColumnInfo[] = [
  { cid: 0, name: 'id', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 1 },
  { cid: 1, name: 'name', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
];
const rows = [{ id: 1, name: 'Ana' }];

describe('RowGrid', () => {
  it('renders column headers and row values', () => {
    render(<RowGrid columns={columns} rows={rows} onUpdateCell={vi.fn()} onDeleteRow={vi.fn()} />);

    expect(screen.getByText('id')).toBeInTheDocument();
    expect(screen.getByText('name')).toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();
  });

  it('shows an empty state when there are no rows', () => {
    render(<RowGrid columns={columns} rows={[]} onUpdateCell={vi.fn()} onDeleteRow={vi.fn()} />);

    expect(screen.getByText('No rows yet.')).toBeInTheDocument();
  });

  it('calls onUpdateCell when an editable cell is blurred with a new value', () => {
    const onUpdateCell = vi.fn();
    render(<RowGrid columns={columns} rows={rows} onUpdateCell={onUpdateCell} onDeleteRow={vi.fn()} />);

    const cell = screen.getByText('Ana');
    cell.textContent = 'Ana Souza';
    fireEvent.blur(cell);

    expect(onUpdateCell).toHaveBeenCalledWith(rows[0], 'name', 'Ana Souza');
  });

  it('does not call onUpdateCell when the value is unchanged', () => {
    const onUpdateCell = vi.fn();
    render(<RowGrid columns={columns} rows={rows} onUpdateCell={onUpdateCell} onDeleteRow={vi.fn()} />);

    fireEvent.blur(screen.getByText('Ana'));

    expect(onUpdateCell).not.toHaveBeenCalled();
  });

  it('the primary key column is not editable', () => {
    render(<RowGrid columns={columns} rows={rows} onUpdateCell={vi.fn()} onDeleteRow={vi.fn()} />);

    expect(screen.getByText('1')).not.toHaveAttribute('contenteditable', 'true');
  });

  it('requires a second click to confirm delete', () => {
    const onDeleteRow = vi.fn();
    render(<RowGrid columns={columns} rows={rows} onUpdateCell={vi.fn()} onDeleteRow={onDeleteRow} />);

    fireEvent.click(screen.getByText('Delete'));
    expect(onDeleteRow).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Confirm'));
    expect(onDeleteRow).toHaveBeenCalledWith(rows[0]);
  });

  it('cancel aborts the delete confirmation without calling onDeleteRow', () => {
    const onDeleteRow = vi.fn();
    render(<RowGrid columns={columns} rows={rows} onUpdateCell={vi.fn()} onDeleteRow={onDeleteRow} />);

    fireEvent.click(screen.getByText('Delete'));
    fireEvent.click(screen.getByText('Cancel'));

    expect(screen.getByText('Delete')).toBeInTheDocument();
    expect(onDeleteRow).not.toHaveBeenCalled();
  });
});
