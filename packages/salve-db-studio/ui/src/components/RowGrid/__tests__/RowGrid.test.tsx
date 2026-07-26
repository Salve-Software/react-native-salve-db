import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { RowGrid } from '../index';
import type { IColumnInfo } from '../../../types';

const columns: IColumnInfo[] = [
  { cid: 0, name: 'id', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 1 },
  { cid: 1, name: 'name', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
];
const rows = [{ id: 1, name: 'Ana' }];

function renderGrid(overrides: Partial<React.ComponentProps<typeof RowGrid>> = {}) {
  return render(
    <RowGrid
      columns={columns}
      rows={rows}
      page={0}
      hasNextPage={false}
      onNextPage={vi.fn()}
      onPrevPage={vi.fn()}
      onUpdateCell={vi.fn()}
      onDeleteRow={vi.fn()}
      onDeleteRows={vi.fn()}
      {...overrides}
    />
  );
}

describe('RowGrid', () => {
  it('renders column headers and row values', () => {
    renderGrid();

    expect(screen.getByText('id')).toBeInTheDocument();
    expect(screen.getByText('name')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Ana')).toBeInTheDocument();
  });

  it('shows an empty state when there are no rows', () => {
    renderGrid({ rows: [] });

    expect(screen.getByText('No rows yet.')).toBeInTheDocument();
  });

  it('the primary key column is rendered as plain text, not an editable field', () => {
    renderGrid();

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('1')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('id of row 1')).not.toBeInTheDocument();
  });

  it('requires a second click to confirm a single row delete', () => {
    const onDeleteRow = vi.fn();
    renderGrid({ onDeleteRow });

    fireEvent.click(screen.getByText('Delete'));
    expect(onDeleteRow).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Confirm'));
    expect(onDeleteRow).toHaveBeenCalledWith(rows[0]);
  });

  it('cancel aborts the single row delete confirmation', () => {
    const onDeleteRow = vi.fn();
    renderGrid({ onDeleteRow });

    fireEvent.click(screen.getByText('Delete'));
    fireEvent.click(screen.getByText('Cancel'));

    expect(screen.getByText('Delete')).toBeInTheDocument();
    expect(onDeleteRow).not.toHaveBeenCalled();
  });

  describe('editing', () => {
    // Editable cells are <input>s rather than contentEditable <td>s: React
    // rewrites a contentEditable's text node on every keystroke, which drops
    // the caret back to position 0 mid-word.
    function nameCell() {
      return screen.getByLabelText('name of row 1');
    }

    function type(cell: HTMLElement, value: string) {
      fireEvent.change(cell, { target: { value } });
    }

    it('renders editable cells as inputs holding the current value', () => {
      renderGrid();

      const cell = nameCell();
      expect(cell.tagName).toBe('INPUT');
      expect(cell).toHaveValue('Ana');
    });

    // jsdom has no Tailwind build, so this can only assert the classes are wired
    // up — but that is exactly what silently went missing when the cell stopped
    // being a contentEditable <td> and the `td[contenteditable]:focus` rule died.
    it('outlines the whole cell while its input has focus', () => {
      renderGrid();

      const cell = nameCell().closest('td');
      expect(cell).toHaveClass(
        'focus-within:outline-2',
        'focus-within:-outline-offset-2',
        'focus-within:outline-accent'
      );
    });

    it('shows NULL as a placeholder so typing does not append to the literal text', () => {
      renderGrid({ rows: [{ id: 1, name: null }] });

      const cell = nameCell();
      expect(cell).toHaveValue('');
      expect(cell).toHaveAttribute('placeholder', 'NULL');
    });

    it('does not call onUpdateCell immediately when typing — stages it as a pending change', () => {
      const onUpdateCell = vi.fn();
      renderGrid({ onUpdateCell });

      type(nameCell(), 'Ana Souza');

      expect(onUpdateCell).not.toHaveBeenCalled();
      expect(screen.getByText('1 unsaved change')).toBeInTheDocument();
      expect(nameCell()).toHaveValue('Ana Souza');
    });

    it('clears the pending change if the value is edited back to the original', async () => {
      renderGrid();

      type(nameCell(), 'Ana Souza');
      expect(screen.getByText('1 unsaved change')).toBeInTheDocument();

      type(nameCell(), 'Ana');
      await waitFor(() => expect(screen.queryByText('1 unsaved change')).not.toBeInTheDocument());
    });

    it('Save changes commits every pending edit and clears the dirty state', () => {
      const onUpdateCell = vi.fn();
      renderGrid({ onUpdateCell });
      type(nameCell(), 'Ana Souza');

      fireEvent.click(screen.getByText('Save changes'));

      expect(onUpdateCell).toHaveBeenCalledWith(rows[0], 'name', 'Ana Souza');
    });

    it('Discard clears pending edits and restores the original value', async () => {
      const onUpdateCell = vi.fn();
      renderGrid({ onUpdateCell });
      type(nameCell(), 'Ana Souza');

      fireEvent.click(screen.getByText('Discard'));

      expect(onUpdateCell).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByText('Save changes')).not.toBeInTheDocument());
      expect(nameCell()).toHaveValue('Ana');
    });
  });

  describe('row selection', () => {
    const twoRows = [
      { id: 1, name: 'Ana' },
      { id: 2, name: 'Bob' },
    ];

    it('shows a selection bar with the count once a row is checked', () => {
      renderGrid({ rows: twoRows });

      fireEvent.click(screen.getByLabelText('Select row 1'));

      expect(screen.getByText('1 selected')).toBeInTheDocument();
    });

    it('select-all checks every row, and Delete selected requires confirmation', () => {
      const onDeleteRows = vi.fn();
      renderGrid({ rows: twoRows, onDeleteRows });

      fireEvent.click(screen.getByLabelText('Select all rows'));
      expect(screen.getByText('2 selected')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Delete selected (2)'));
      expect(onDeleteRows).not.toHaveBeenCalled();

      fireEvent.click(screen.getByText('Confirm'));
      expect(onDeleteRows).toHaveBeenCalledWith(twoRows);
    });

    it('Clear empties the selection', async () => {
      renderGrid({ rows: twoRows });

      fireEvent.click(screen.getByLabelText('Select row 1'));
      fireEvent.click(screen.getByText('Clear'));

      await waitFor(() => expect(screen.queryByText('1 selected')).not.toBeInTheDocument());
    });
  });

  describe('pagination', () => {
    it('disables Previous on the first page', () => {
      renderGrid({ page: 0 });

      expect(screen.getByLabelText('Previous page')).toBeDisabled();
    });

    it('calls onPrevPage/onNextPage', () => {
      const onNextPage = vi.fn();
      const onPrevPage = vi.fn();
      renderGrid({ page: 1, hasNextPage: true, onNextPage, onPrevPage });

      fireEvent.click(screen.getByLabelText('Next page'));
      fireEvent.click(screen.getByLabelText('Previous page'));

      expect(onNextPage).toHaveBeenCalledTimes(1);
      expect(onPrevPage).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Page 2')).toBeInTheDocument();
    });

    it('disables Next when there is no next page', () => {
      renderGrid({ hasNextPage: false });

      expect(screen.getByLabelText('Next page')).toBeDisabled();
    });
  });

  describe('column visibility', () => {
    it('hides a column from the table when unchecked in the Columns menu', () => {
      renderGrid();

      fireEvent.click(screen.getByText('Columns'));
      fireEvent.click(screen.getByRole('checkbox', { name: 'name' }));

      const table = screen.getByRole('table');
      expect(screen.queryByDisplayValue('Ana')).not.toBeInTheDocument();
      expect(within(table).getByText('id')).toBeInTheDocument();
    });
  });
});
