export interface JwtUserPayload {
    login: string
    name: string
    email: string,
    // null until the user joins or creates a family
    group: {
        title: string
        totalMembers: number
    } | null
}
