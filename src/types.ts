export type Gender = "男" | "女" | "その他" | "未設定";

export const GENDERS: Gender[] = ["男", "女", "その他", "未設定"];
/** 「男子のみ」などの絞り込みに使う性別 */
export const FILTER_GENDERS: Gender[] = ["男", "女", "その他"];
export const GRADES = [1, 2, 3, 4, 5, 6];

/** 退部・OB の人は新しい会計の対象に入らないが、過去の記録には残る */
export type Status = "在籍" | "退部" | "OB";
export const STATUSES: Status[] = ["在籍", "退部", "OB"];

export function isActive(member: Member): boolean {
  return member.status === "在籍";
}

export type Member = {
  id: string;
  name: string;
  grade: number;
  gender: Gender;
  status: Status;
  /** 継続届の学籍番号。毎年の読み込みで同じ人を見分けるのに使う */
  studentId?: string;
  faculty?: string;
};

/** 高速・ガソリンは移動ごとに「乗った人 − 運転手」で割る。雑費は会計の対象部員で割る。 */
export type Category = "高速" | "ガソリン" | "雑費";

export const CATEGORIES: Category[] = ["雑費", "高速", "ガソリン"];

export function isTravel(category: Category): boolean {
  return category !== "雑費";
}

/** 通年（全期間）用の特別な会計。対象は在籍中の全員。 */
export const ANNUAL = "annual";

/** 車での移動1回分（①、② など） */
export type Trip = {
  id: string;
  name: string;
  riderIds: string[];
  driverIds: string[];
};

/** 会計1回分（春部費、夏合宿まで など） */
export type ClubEvent = {
  id: string;
  name: string;
  /** 雑費を割る対象の部員 */
  participantIds: string[];
  trips: Trip[];
};

export type Burden =
  | { mode: "all" }
  | { mode: "filter"; grades: number[]; genders: Gender[] }
  | { mode: "pick"; memberIds: string[] };

export type Expense = {
  id: string;
  eventId: string;
  category: Category;
  /** 高速・ガソリンのときの移動 */
  tripId: string | null;
  title: string;
  amount: number;
  /** 高速・ガソリンのときの運転した人。その移動の高速・ガソリンの割り勘から外れる */
  driverId: string | null;
  /** 立て替えた部員。null は未選択（精算に入らない） */
  payerId: string | null;
  /** 雑費のときだけ使う */
  burden: Burden;
  note: string;
};

export type Data = {
  version: 2;
  members: Member[];
  events: ClubEvent[];
  expenses: Expense[];
  /** 会計ID → 精算済みの部員ID */
  settled: Record<string, string[]>;
};
