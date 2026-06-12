"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";

// Регистрация серверов под наблюдение (SRVCHK-14). Кабинет пишет ТОЛЬКО в
// server_checker.server; сами SSH-ключи живут у координатора (решение Q3 спеки) —
// форма принимает лишь ИМЯ ключа, никаких секретов. RBAC — внутри action,
// не только скрытие UI (итог ревью плана).

export type ServerFormResult = { error?: string; id?: number };

async function requireServersManager() {
  const session = await auth();
  if (!session?.user || !can.manageServers(session.user.role)) {
    throw new Error("Недостаточно прав");
  }
  return session.user;
}

const NAME_RE = /^[\w.-]{1,64}$/;
// underscore разрешён: валидные алиасы OpenSSH могут его содержать (ревью)
const HOST_RE = /^[a-zA-Z0-9_][a-zA-Z0-9._-]{0,252}$/;
const USER_RE = /^[a-z_][a-z0-9_-]{0,31}$/;

function parseForm(formData: FormData): { error?: string; values?: {
  name: string; host: string; port: number; ssh_user: string; key_name: string | null;
  poll_interval_min: number; provider: string | null; purpose: string | null; enabled: boolean;
} } {
  const name = String(formData.get("name") ?? "").trim();
  const host = String(formData.get("host") ?? "").trim();
  const port = Number(formData.get("port") ?? 22);
  const ssh_user = String(formData.get("ssh_user") ?? "root").trim();
  const key_name = String(formData.get("key_name") ?? "").trim() || null;
  const poll_interval_min = Number(formData.get("poll_interval_min") ?? 15);
  const provider = String(formData.get("provider") ?? "").trim().slice(0, 200) || null;
  const purpose = String(formData.get("purpose") ?? "").trim().slice(0, 200) || null;
  // невыбранный checkbox браузер НЕ отправляет: выключение работает только так (ревью P1)
  const enabled = formData.get("enabled") === "on";

  if (!NAME_RE.test(name)) return { error: "Название: латиница/цифры/точка/дефис, до 64 символов" };
  if (!HOST_RE.test(host)) return { error: "Host: алиас ssh-конфига координатора, hostname или IP" };
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { error: "Порт: 1–65535" };
  if (!USER_RE.test(ssh_user)) return { error: "Пользователь SSH: некорректное имя" };
  if (key_name && !/^[\w.@-]{1,64}$/.test(key_name)) return { error: "Имя ключа: некорректное" };
  if (!Number.isInteger(poll_interval_min) || poll_interval_min < 1 || poll_interval_min > 1440) {
    return { error: "Период съёма: 1–1440 минут" };
  }
  // ключи/пароли в форме не принимаются by design (Q3): поле есть только для ИМЕНИ ключа
  return { values: { name, host, port, ssh_user, key_name, poll_interval_min, provider, purpose, enabled } };
}

export async function addServer(
  _prev: ServerFormResult | undefined,
  formData: FormData
): Promise<ServerFormResult> {
  await requireServersManager();
  const parsed = parseForm(formData);
  if (parsed.error || !parsed.values) return { error: parsed.error };
  const v = parsed.values;
  try {
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO server_checker.server
         (name, host, port, ssh_user, key_name, poll_interval_min, provider, purpose, enabled)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [v.name, v.host, v.port, v.ssh_user, v.key_name, v.poll_interval_min, v.provider, v.purpose, v.enabled]
    );
    revalidatePath("/servers");
    return { id: rows[0].id };
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return { error: "Сервер с таким названием уже есть" };
    return { error: "Не удалось добавить сервер" }; // сырые ошибки БД в UI не уходят
  }
}

export async function updateServer(
  serverId: number,
  _prev: ServerFormResult | undefined,
  formData: FormData
): Promise<ServerFormResult> {
  await requireServersManager();
  if (!Number.isInteger(serverId)) return { error: "Некорректный сервер" };
  const parsed = parseForm(formData);
  if (parsed.error || !parsed.values) return { error: parsed.error };
  const v = parsed.values;
  try {
    const { rowCount } = await db.query(
      `UPDATE server_checker.server SET
         name=$2, host=$3, port=$4, ssh_user=$5, key_name=$6,
         poll_interval_min=$7, provider=$8, purpose=$9, enabled=$10
       WHERE id=$1`,
      [serverId, v.name, v.host, v.port, v.ssh_user, v.key_name,
       v.poll_interval_min, v.provider, v.purpose, v.enabled]
    );
    if (!rowCount) return { error: "Сервер не найден" };
    revalidatePath("/servers");
    revalidatePath(`/servers/${serverId}`);
    return { id: serverId };
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return { error: "Сервер с таким названием уже есть" };
    return { error: "Не удалось сохранить изменения" };
  }
}
