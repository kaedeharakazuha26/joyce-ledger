/** TypeScript mirrors of the Rust structs (camelCase via serde). Amounts are centavos. */

export interface DateFilter {
  from: string | null;
  to: string | null;
}

export interface Totals {
  count: number;
  amount: number;
  quantity: number;
}

/** Fields every record module shares. */
export interface BaseRecord {
  id: number;
  amount: number;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface Sale extends BaseRecord {
  category: string;
}
export interface SaleInput {
  category: string;
  amount: number;
  date: string;
}

export interface Expense extends BaseRecord {
  category: string;
}
export interface ExpenseInput {
  category: string;
  amount: number;
  date: string;
}

export interface LdCommission extends BaseRecord {
  name: string;
  quantity: number;
}
export interface LdCommissionInput {
  name: string;
  quantity: number;
  amount: number;
  date: string;
}

export interface Commission extends BaseRecord {
  name: string;
  category: string;
}
export interface CommissionInput {
  name: string;
  category: string;
  amount: number;
  date: string;
}

export interface Salary extends BaseRecord {
  name: string;
}
export interface SalaryInput {
  name: string;
  amount: number;
  date: string;
}

export interface Employee {
  id: number;
  name: string;
  position: string | null;
  baseSalary: number;
  commission: number;
  ldCommission: number;
  createdAt: string;
}
export interface EmployeeInput {
  name: string;
  position: string | null;
  baseSalary?: number | null;
  commission?: number | null;
  ldCommission?: number | null;
}

/** Module keys match the Rust command suffixes (list_<module>, ...). */
export type ModuleKey = "sales" | "expenses" | "ld_commissions" | "commissions" | "salaries";

export type SuggestionKind = "salesCategory" | "expensesCategory" | "commissionsCategory" | "names";

export interface Branch {
  id: string;
  name: string;
  createdAt: string;
}
