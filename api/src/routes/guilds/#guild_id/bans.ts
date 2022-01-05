import { Request, Response, Router } from "express";
import { emitEvent, getPermission, GuildBanAddEvent, GuildBanRemoveEvent, Guild, Ban, User, Member } from "@fosscord/util";
import { HTTPError } from "lambert-server";
import { getIpAdress, route } from "@fosscord/api";

export interface BanCreateSchema {
	delete_message_days?: string;
	reason?: string;
};

export interface BanRegistrySchema {
	id: string;
	user_id: string;
	guild_id: string;
	executor_id: string;
	ip?: string;
	reason?: string | undefined;
};

const router: Router = Router();

/* TODO: Deleting the secrets is just a temporary go-around. Views should be implemented for both safety and better handling. */

router.get("/", route({ permission: "BAN_MEMBERS" }), async (req: Request, res: Response) => {
	const { guild_id } = req.params;

	let bans = await Ban.find({ guild_id: guild_id });

	/* Filter secret from database registry.*/
	
	bans.forEach((registry: BanRegistrySchema) => {
	delete registry.ip;
	});

	return res.json(bans);
});

router.get("/:user", route({ permission: "BAN_MEMBERS" }), async (req: Request, res: Response) => {
	const { guild_id } = req.params;
	const user_id = req.params.ban;

	let ban = await Ban.findOneOrFail({ guild_id: guild_id, user_id: user_id }) as BanRegistrySchema;
	
	/* Filter secret from registry. */

	delete ban.ip

	return res.json(ban);
});

router.put("/:user_id", route({ body: "BanCreateSchema", permission: "BAN_MEMBERS" }), async (req: Request, res: Response) => {
	const { guild_id } = req.params;
	const banned_user_id = req.params.user_id;

	const banned_user = await User.getPublicUser(banned_user_id);

	if (req.user_id === banned_user_id) throw new HTTPError("You can't ban yourself", 400);
	if (req.permission!.cache.guild?.owner_id === banned_user_id) throw new HTTPError("You can't ban the owner", 400);

	const ban = new Ban({
		user_id: banned_user_id,
		guild_id: guild_id,
		ip: getIpAdress(req),
		executor_id: req.user_id,
		reason: req.body.reason // || otherwise empty
	});

	await Promise.all([
		Member.removeFromGuild(banned_user_id, guild_id),
		ban.save(),
		emitEvent({
			event: "GUILD_BAN_ADD",
			data: {
				guild_id: guild_id,
				user: banned_user
			},
			guild_id: guild_id
		} as GuildBanAddEvent)
	]);

	return res.json(ban);
});

router.delete("/:user_id", route({ permission: "BAN_MEMBERS" }), async (req: Request, res: Response) => {
	const { guild_id, user_id } = req.params;

	const banned_user = await User.getPublicUser(user_id);

	await Promise.all([
		Ban.delete({
			user_id: user_id,
			guild_id
		}),

		emitEvent({
			event: "GUILD_BAN_REMOVE",
			data: {
				guild_id,
				user: banned_user
			},
			guild_id
		} as GuildBanRemoveEvent)
	]);

	return res.status(204).send();
});

export default router;
