import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireAuth } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import { leads, searchBusinesses, searches } from "@/lib/db/schema";
import { parseSocialsInput } from "@/lib/social-urls";

const PatchSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    phone: z.string().max(100).nullable().optional(),
    email: z.string().max(320).nullable().optional(),
    website: z.string().max(2000).nullable().optional(),
    address: z.string().max(1000).nullable().optional(),
    socials: z.string().max(4000).nullable().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "At least one field must be provided",
  });

type RouteContext = { params: Promise<{ id: string }> };

async function loadOwnedBusiness(userId: string, role: string, id: string) {
  const db = getDb();
  const [row] = await db
    .select({
      id: searchBusinesses.id,
      title: searchBusinesses.title,
      phone: searchBusinesses.phone,
      email: searchBusinesses.email,
      website: searchBusinesses.website,
      hasWebsite: searchBusinesses.hasWebsite,
      address: searchBusinesses.address,
      searchId: searchBusinesses.searchId,
      agentId: searches.agentId,
      placeId: searchBusinesses.placeId,
      rating: searchBusinesses.rating,
      reviews: searchBusinesses.reviews,
      type: searchBusinesses.type,
      mapsUrl: searchBusinesses.mapsUrl,
      thumbnail: searchBusinesses.thumbnail,
      latitude: searchBusinesses.latitude,
      longitude: searchBusinesses.longitude,
    })
    .from(searchBusinesses)
    .innerJoin(searches, eq(searchBusinesses.searchId, searches.id))
    .where(
      and(
        eq(searchBusinesses.id, id),
        role === "agent" ? eq(searches.agentId, userId) : undefined,
      ),
    )
    .limit(1);

  return row ?? null;
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id } = await context.params;

    const json = (await request.json()) as unknown;
    const parsed = PatchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const existing = await loadOwnedBusiness(user.id, user.role, id);
    if (!existing) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const patch = parsed.data;
    const nextTitle = patch.title?.trim() ?? existing.title;
    const nextPhone =
      patch.phone !== undefined ? emptyToNull(patch.phone) : existing.phone;
    const nextEmail =
      patch.email !== undefined ? emptyToNull(patch.email) : existing.email;
    const nextWebsite =
      patch.website !== undefined ? emptyToNull(patch.website) : existing.website;
    const nextAddress =
      patch.address !== undefined ? emptyToNull(patch.address) : existing.address;
    const nextHasWebsite = Boolean(nextWebsite);
    const nextSocials =
      patch.socials !== undefined ? parseSocialsInput(patch.socials) : undefined;

    const db = getDb();
    const [updated] = await db
      .update(searchBusinesses)
      .set({
        title: nextTitle,
        phone: nextPhone,
        email: nextEmail,
        website: nextWebsite,
        hasWebsite: nextHasWebsite,
        address: nextAddress,
      })
      .where(eq(searchBusinesses.id, id))
      .returning({
        id: searchBusinesses.id,
        title: searchBusinesses.title,
        phone: searchBusinesses.phone,
        email: searchBusinesses.email,
        website: searchBusinesses.website,
        hasWebsite: searchBusinesses.hasWebsite,
        address: searchBusinesses.address,
        searchId: searchBusinesses.searchId,
      });

    const [existingLead] = await db
      .select({ id: leads.id, socials: leads.socials })
      .from(leads)
      .where(eq(leads.searchBusinessId, id))
      .limit(1);

    const socialsValue =
      nextSocials !== undefined ? nextSocials : (existingLead?.socials ?? null);

    if (existingLead) {
      await db
        .update(leads)
        .set({
          title: nextTitle,
          phone: nextPhone,
          address: nextAddress,
          ...(nextSocials !== undefined ? { socials: nextSocials } : {}),
        })
        .where(eq(leads.id, existingLead.id));
    } else if (nextSocials) {
      await db.insert(leads).values({
        searchId: existing.searchId,
        searchBusinessId: id,
        title: nextTitle,
        placeId: existing.placeId,
        address: nextAddress,
        phone: nextPhone,
        rating: existing.rating,
        reviews: existing.reviews,
        type: existing.type,
        mapsUrl: existing.mapsUrl,
        thumbnail: existing.thumbnail,
        latitude: existing.latitude,
        longitude: existing.longitude,
        socials: nextSocials,
      });
    }

    return NextResponse.json({
      business: { ...updated, socials: socialsValue },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to update business";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id } = await context.params;

    const existing = await loadOwnedBusiness(user.id, user.role, id);
    if (!existing) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const db = getDb();
    // Delete linked lead first (proposals cascade). searchBusinessId is set-null only.
    await db.delete(leads).where(eq(leads.searchBusinessId, id));
    await db.delete(searchBusinesses).where(eq(searchBusinesses.id, id));

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to delete business";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
