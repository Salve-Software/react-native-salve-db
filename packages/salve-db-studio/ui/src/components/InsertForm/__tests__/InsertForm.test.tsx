import { render, screen, fireEvent } from '@testing-library/react';
import { InsertForm } from '../index';
import type { IColumnInfo } from '../../../types';

const columns: IColumnInfo[] = [
  { cid: 0, name: 'id', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 1 },
  { cid: 1, name: 'name', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
  { cid: 2, name: 'email', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
];

describe('InsertForm', () => {
  it('only renders inputs for non-primary-key columns', () => {
    render(<InsertForm columns={columns} onSubmit={vi.fn()} />);

    expect(screen.queryByLabelText('id')).not.toBeInTheDocument();
    expect(screen.getByLabelText('name')).toBeInTheDocument();
    expect(screen.getByLabelText('email')).toBeInTheDocument();
  });

  it('submits only the non-empty filled values', () => {
    const onSubmit = vi.fn();
    render(<InsertForm columns={columns} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText('name'), { target: { value: 'Ana' } });
    fireEvent.click(screen.getByText('Insert'));

    expect(onSubmit).toHaveBeenCalledWith({ name: 'Ana' });
  });

  it('clears its inputs after submit', () => {
    render(<InsertForm columns={columns} onSubmit={vi.fn()} />);

    const input = screen.getByLabelText('name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Ana' } });
    fireEvent.click(screen.getByText('Insert'));

    expect(input.value).toBe('');
  });
});
